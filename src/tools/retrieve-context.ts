import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import {
  E_CANCELLED,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { sanitizeFtsQuery } from '../lib/search.js';
import { getToolContract } from '../lib/tool-contracts.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory, MemoryRow } from '../lib/types.js';
import { type RetrieveContextInputSchema } from '../schemas/inputs.js';
import { type RetrieveContextResultSchema } from '../schemas/outputs.js';
import {
  createProgressReporter,
  notifyProgress,
  progressWithMessage,
} from './progress.js';
import {
  countPayloadArrayItems,
  getToolResultPayload,
  isOkStructuredToolResult,
} from './result.js';

type RetrieveContextInput = z.infer<typeof RetrieveContextInputSchema>;
type ContextStrategy = RetrieveContextInput['strategy'];

const MIN_CANDIDATE_ROWS = 200;
const MAX_CANDIDATE_ROWS = 2000;
const ESTIMATED_CHARS_PER_TOKEN = 4;
// Assume average memory is ~20 tokens to set a reasonable upper bound for candidates
const ESTIMATED_TOKENS_PER_MEMORY = 20;

const RETRIEVE_CONTEXT_PROGRESS_MILESTONE = 25;

const ORDER_BY_MAP = {
  importance: 'm.importance DESC, memories_fts.rank',
  recency: 'm.created_at DESC, memories_fts.rank',
  relevance: 'memories_fts.rank',
} as const satisfies Record<ContextStrategy, string>;

function countPayloadMemories(payload: Record<string, unknown>): number {
  return countPayloadArrayItems(payload, 'memories');
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / ESTIMATED_CHARS_PER_TOKEN);
}

function loadContextRows(
  db: TypedDb,
  query: string,
  orderBy: string,
  limit: number
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  return db
    .prepareOnce<MemoryRow>(
      `SELECT m.*, memories_fts.rank AS rank FROM memories m
       JOIN memories_fts ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?
       ORDER BY ${orderBy}
       LIMIT ?`
    )
    .all(ftsQuery, limit + 1);
}

function reportSelectionProgress(
  onProgress:
    | ((progress: { current: number; total?: number }) => void)
    | undefined,
  current: number,
  total: number,
  force = false
): void {
  if (!onProgress || current === 0) {
    return;
  }
  if (!force && current % RETRIEVE_CONTEXT_PROGRESS_MILESTONE !== 0) {
    return;
  }
  onProgress({ current, total });
}

function formatCompletionMessage(
  query: string,
  result: CallToolResult
): string {
  if (result.structuredContent?.error) {
    const error = result.structuredContent.error as { code?: string };
    if (error.code === E_CANCELLED) {
      return `⊙ retrieve_context: ${query} • cancelled`;
    }
  }

  const failedMessage = `⊙ retrieve_context: ${query} • failed`;
  if (result.isError) {
    return failedMessage;
  }
  if (!isOkStructuredToolResult(result)) {
    return failedMessage;
  }

  const payload = getToolResultPayload(result);
  if (!payload) {
    return `⊙ retrieve_context: ${query} • completed`;
  }

  const memoriesCount = countPayloadMemories(payload);
  const estimatedTokens =
    'estimated_tokens' in payload &&
    typeof payload.estimated_tokens === 'number'
      ? payload.estimated_tokens
      : 0;
  const truncated =
    'truncated' in payload && payload.truncated === true ? ' [truncated]' : '';

  return `⊙ retrieve_context: ${query} • ${memoriesCount} memories, ${estimatedTokens} tokens${truncated}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new Error(E_CANCELLED);
}

export function registerRetrieveContext(server: McpServer, db: TypedDb): void {
  const contract = getToolContract('retrieve_context');
  server.registerTool(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema as typeof RetrieveContextInputSchema,
      outputSchema: contract.outputSchema as typeof RetrieveContextResultSchema,
      annotations: contract.annotations,
    },
    async (params: RetrieveContextInput, extra) => {
      const { query, strategy } = params;
      const tokenBudget = params.token_budget;
      const contextLabel = `⊙ retrieve_context: ${query} [${strategy}]`;
      let completionCurrent = 1;

      // Heuristic: Load enough candidates to likely fill the budget, but cap to avoid massive queries
      const estimatedCandidates = Math.ceil(
        tokenBudget / ESTIMATED_TOKENS_PER_MEMORY
      );
      const limit = Math.min(
        Math.max(MIN_CANDIDATE_ROWS, estimatedCandidates),
        MAX_CANDIDATE_ROWS
      );

      await notifyProgress(extra, {
        current: 0,
        message: `${contextLabel} [budget ${tokenBudget}]`,
      });

      const loopProgress = progressWithMessage(
        createProgressReporter(extra),
        ({ current, total }) =>
          `${contextLabel} [scan ${current}/${Math.max((total ?? current) - 1, current)}]`
      );

      let result: CallToolResult | undefined;
      let thrownError: McpError | undefined;
      try {
        throwIfAborted(extra.signal);
        const orderBy = ORDER_BY_MAP[strategy];
        const rows = loadContextRows(db, query, orderBy, limit);
        const rowCapExceeded = rows.length > limit;
        const candidateCount = rowCapExceeded ? limit : rows.length;
        completionCurrent = candidateCount + 1;

        let estimatedTokens = 0;
        let truncated = rowCapExceeded;
        const selected: Memory[] = [];
        let scanned = 0;

        for (let i = 0; i < candidateCount; i += 1) {
          throwIfAborted(extra.signal);
          const row = rows[i];
          if (row === undefined) {
            break;
          }
          const mem = parseMemoryRow(row);
          const tokens = estimateTokens(mem.content);
          scanned += 1;
          reportSelectionProgress(
            loopProgress,
            scanned,
            completionCurrent,
            false
          );
          if (estimatedTokens + tokens > tokenBudget) {
            truncated = true;
            break;
          }
          estimatedTokens += tokens;
          selected.push(mem);
        }

        reportSelectionProgress(loopProgress, scanned, completionCurrent, true);

        result = createToolResponse({
          memories: selected,
          estimated_tokens: estimatedTokens,
          truncated,
        });
      } catch (err) {
        if (err instanceof Error && err.message === E_CANCELLED) {
          result = createErrorResponse(E_CANCELLED, 'Request cancelled');
        } else if (err instanceof McpError) {
          thrownError = err;
        } else {
          rethrowMcpError(err);
          result = createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      }

      await loopProgress.flush();

      const completionResult =
        result ?? createErrorResponse(E_UNKNOWN, getErrorMessage(thrownError));

      await notifyProgress(extra, {
        current: completionCurrent,
        total: completionCurrent,
        message: formatCompletionMessage(query, completionResult),
      });

      if (thrownError) {
        throw thrownError;
      }

      return completionResult;
    }
  );
}
