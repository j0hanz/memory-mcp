import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
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

function getOrderBy(strategy: ContextStrategy): string {
  if (strategy === 'importance') {
    return 'm.importance DESC, memories_fts.rank';
  }
  if (strategy === 'recency') {
    return 'm.created_at DESC, memories_fts.rank';
  }
  return 'memories_fts.rank';
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
    .prepare<MemoryRow>(
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
  if (result.isError) {
    return `⊙ retrieve_context: ${query} • failed`;
  }
  if (!isOkStructuredToolResult(result)) {
    return `⊙ retrieve_context: ${query} • failed`;
  }

  const payload = getToolResultPayload(result);
  if (!payload) {
    return `⊙ retrieve_context: ${query} • completed`;
  }

  const memoriesCount =
    'memories' in payload && Array.isArray(payload.memories)
      ? payload.memories.length
      : 0;
  const estimatedTokens =
    'estimated_tokens' in payload &&
    typeof payload.estimated_tokens === 'number'
      ? payload.estimated_tokens
      : 0;
  const truncated =
    'truncated' in payload && payload.truncated === true ? ' [truncated]' : '';

  return `⊙ retrieve_context: ${query} • ${memoriesCount} memories, ${estimatedTokens} tokens${truncated}`;
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

      let result: CallToolResult;
      try {
        const orderBy = getOrderBy(strategy);
        const rows = loadContextRows(db, query, orderBy);
        const rowCapExceeded = rows.length > RETRIEVE_CONTEXT_LIMIT;
        const candidateRows = rowCapExceeded
          ? rows.slice(0, RETRIEVE_CONTEXT_LIMIT)
          : rows;

        const loopProgress = progressWithMessage(
          createProgressReporter(extra),
          ({ current, total }) =>
            `${contextLabel} [scan ${current}/${total ?? current}]`
        );

        let estimatedTokens = 0;
        let truncated = rowCapExceeded;
        const selected: Memory[] = [];
        let scanned = 0;

        for (const row of candidateRows) {
          const mem = parseMemoryRow(row);
          const tokens = estimateTokens(mem.content);
          scanned += 1;
          reportSelectionProgress(
            loopProgress,
            scanned,
            candidateRows.length,
            false
          );
          if (estimatedTokens + tokens > tokenBudget) {
            truncated = true;
            break;
          }
          estimatedTokens += tokens;
          selected.push(mem);
        }

        reportSelectionProgress(
          loopProgress,
          scanned,
          candidateRows.length,
          true
        );
        completionCurrent = candidateRows.length + 1;

        result = createToolResponse({
          ok: true,
          result: {
            memories: selected,
            estimated_tokens: estimatedTokens,
            truncated,
          },
        });
      } catch (err) {
        result = createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }

      await notifyProgress(extra, {
        current: completionCurrent,
        total: completionCurrent,
        message: formatCompletionMessage(query, result),
      });

      return result;
    }
  );
}
