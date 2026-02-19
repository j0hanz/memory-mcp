import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage, rethrowMcpError } from '../lib/errors.js';
import { sanitizeFtsQuery } from '../lib/search.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory, MemoryRow } from '../lib/types.js';
import { RetrieveContextInputSchema } from '../schemas/inputs.js';
import { RetrieveContextResultSchema } from '../schemas/outputs.js';
import {
  createProgressReporter,
  notifyProgress,
  progressWithMessage,
} from './progress.js';
import { getToolResultPayload, isOkStructuredToolResult } from './result.js';

type RetrieveContextInput = z.infer<typeof RetrieveContextInputSchema>;
type ContextStrategy = RetrieveContextInput['strategy'];

const RETRIEVE_CONTEXT_LIMIT = 200;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const RETRIEVE_CONTEXT_PROGRESS_MILESTONE = 25;

const ORDER_BY_MAP = {
  importance: 'm.importance DESC, memories_fts.rank',
  recency: 'm.created_at DESC, memories_fts.rank',
  relevance: 'memories_fts.rank',
} as const satisfies Record<ContextStrategy, string>;

function countPayloadArrayItems(
  payload: Record<string, unknown>,
  key: string
): number {
  const value = payload[key];
  return Array.isArray(value) ? value.length : 0;
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / ESTIMATED_CHARS_PER_TOKEN);
}

function loadContextRows(
  db: TypedDb,
  query: string,
  orderBy: string
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  return db
    .prepareOnce<MemoryRow>(
      `SELECT m.*, memories_fts.rank AS rank FROM memories m
       JOIN memories_fts ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?
       ORDER BY ${orderBy}
       LIMIT ${RETRIEVE_CONTEXT_LIMIT + 1}`
    )
    .all(ftsQuery);
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

  const memoriesCount = countPayloadArrayItems(payload, 'memories');
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

  throw new McpError(ErrorCode.RequestTimeout, 'Request cancelled');
}

export function registerRetrieveContext(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'retrieve_context',
    {
      title: 'Retrieve Context',
      description:
        'Search memories and return relevance-ranked results that fit within a caller-specified token budget. Eliminates manual pagination and token counting for context window management.',
      inputSchema: RetrieveContextInputSchema,
      outputSchema: RetrieveContextResultSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (params: RetrieveContextInput, extra) => {
      const { query, strategy } = params;
      const tokenBudget = params.token_budget;
      const contextLabel = `⊙ retrieve_context: ${query} [${strategy}]`;
      let completionCurrent = 1;

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
        const rows = loadContextRows(db, query, orderBy);
        const rowCapExceeded = rows.length > RETRIEVE_CONTEXT_LIMIT;
        const candidateCount = rowCapExceeded
          ? RETRIEVE_CONTEXT_LIMIT
          : rows.length;
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
        if (err instanceof McpError) {
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
