import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { throwIfAborted } from '../lib/errors.js';
import {
  buildAndWhereClause,
  buildFilterClauses,
  type MemoryFilters,
  sanitizeFtsQuery,
  toMemoryFilters,
} from '../lib/search.js';
import { createToolResponse } from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory, MemoryRow } from '../lib/types.js';
import { type RetrieveContextInputSchema } from '../schemas/inputs.js';
import {
  createProgressReporter,
  notifyProgress,
  type ProgressContext,
  progressWithMessage,
  runWithProgressCompletion,
} from './progress.js';
import { registerToolWithContract } from './register-contract.js';
import {
  countPayloadArrayItems,
  formatToolCompletionMessage,
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
  limit: number,
  filters: MemoryFilters
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  const filter = buildFilterClauses(filters);
  const whereExtra = buildAndWhereClause(filter.clauses);
  return db
    .prepareOnce<MemoryRow>(
      `SELECT m.*, memories_fts.rank AS rank FROM memories m
       JOIN memories_fts ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?${whereExtra}
       ORDER BY ${orderBy}
       LIMIT ?`
    )
    .all(ftsQuery, ...filter.params, limit + 1);
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
  return formatToolCompletionMessage(
    'retrieve_context',
    query,
    result,
    (payload) => {
      const memoriesCount = countPayloadMemories(payload);
      const estimatedTokens =
        'estimated_tokens' in payload &&
        typeof payload.estimated_tokens === 'number'
          ? payload.estimated_tokens
          : 0;
      const truncated =
        'truncated' in payload && payload.truncated === true
          ? ' [truncated]'
          : '';
      return `${memoriesCount} memories, ${estimatedTokens} tokens${truncated}`;
    }
  );
}

function computeCandidateLimit(tokenBudget: number): number {
  const estimatedCandidates = Math.ceil(
    tokenBudget / ESTIMATED_TOKENS_PER_MEMORY
  );
  return Math.min(
    Math.max(MIN_CANDIDATE_ROWS, estimatedCandidates),
    MAX_CANDIDATE_ROWS
  );
}

interface SelectionResult {
  selected: Memory[];
  estimatedTokens: number;
  truncated: boolean;
}

function selectMemoriesWithinBudget(
  rows: readonly MemoryRow[],
  candidateCount: number,
  tokenBudget: number,
  completionCurrent: number,
  signal: AbortSignal | undefined,
  onProgress:
    | ((progress: { current: number; total?: number }) => void)
    | undefined
): SelectionResult {
  let estimatedTokens = 0;
  let truncated = rows.length > candidateCount;
  const selected: Memory[] = [];
  let scanned = 0;

  for (let i = 0; i < candidateCount; i += 1) {
    throwIfAborted(signal);
    const row = rows[i];
    if (!row) {
      break;
    }

    const memory = parseMemoryRow(row);
    const tokens = estimateTokens(memory.content);
    scanned += 1;

    reportSelectionProgress(onProgress, scanned, completionCurrent, false);

    if (estimatedTokens + tokens > tokenBudget) {
      truncated = true;
      break;
    }

    estimatedTokens += tokens;
    selected.push(memory);
  }

  reportSelectionProgress(onProgress, scanned, completionCurrent, true);

  return { selected, estimatedTokens, truncated };
}

interface RetrieveContextComputation {
  selection: SelectionResult;
  completionCurrent: number;
}

function toRetrieveContextResponse(
  computation: RetrieveContextComputation
): CallToolResult {
  const { selection } = computation;
  return createToolResponse({
    memories: selection.selected,
    estimated_tokens: selection.estimatedTokens,
    truncated: selection.truncated,
  });
}

function computeRetrieveContextResult(
  db: TypedDb,
  params: RetrieveContextInput,
  limit: number,
  signal: AbortSignal | undefined,
  onProgress:
    | ((progress: { current: number; total?: number }) => void)
    | undefined
): RetrieveContextComputation {
  const orderBy = ORDER_BY_MAP[params.strategy];
  const filters = toMemoryFilters(params);
  const rows = loadContextRows(db, params.query, orderBy, limit, filters);
  const rowCapExceeded = rows.length > limit;
  const candidateCount = rowCapExceeded ? limit : rows.length;
  const completionCurrent = candidateCount + 1;

  return {
    selection: selectMemoriesWithinBudget(
      rows,
      candidateCount,
      params.token_budget,
      completionCurrent,
      signal,
      onProgress
    ),
    completionCurrent,
  };
}

export function registerRetrieveContext(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'retrieve_context',
    async (params: RetrieveContextInput, extra: ProgressContext) => {
      const { query, strategy } = params;
      const tokenBudget = params.token_budget;
      const contextLabel = `⊙ retrieve_context: ${query} [${strategy}]`;
      let completionCurrent = 1;

      // Heuristic: Load enough candidates to likely fill the budget, but cap to avoid massive queries.
      const limit = computeCandidateLimit(tokenBudget);

      await notifyProgress(extra, {
        current: 0,
        message: `${contextLabel} [budget ${tokenBudget}]`,
      });

      const loopProgress = progressWithMessage(
        createProgressReporter(extra),
        ({ current, total }) =>
          `${contextLabel} [scan ${current}/${Math.max((total ?? current) - 1, current)}]`
      );

      return runWithProgressCompletion(
        extra,
        () => {
          throwIfAborted(extra.signal);
          const computation = computeRetrieveContextResult(
            db,
            params,
            limit,
            extra.signal,
            loopProgress
          );
          const { completionCurrent: nextCompletionCurrent } = computation;
          completionCurrent = nextCompletionCurrent;
          return toRetrieveContextResponse(computation);
        },
        {
          reporter: loopProgress,
          completionCurrent: () => completionCurrent,
          completionMessage: (result) => formatCompletionMessage(query, result),
        }
      );
    }
  );
}
