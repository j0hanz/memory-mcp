import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { throwIfAborted } from '../lib/errors.js';
import {
  type ProgressNotifier,
  traverseGraph,
} from '../lib/graph-traversal.js';
import { logToolEvent } from '../lib/mcp-utils.js';
import { splitPage } from '../lib/pagination.js';
import {
  buildSearchCursorScope,
  decodeSearchCursor,
  encodeSearchCursor,
} from '../lib/search-cursor.js';
import { loadRankedSearchRows, toMemoryFilters } from '../lib/search.js';
import { createToolResponse } from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory, MemoryRow, RelationshipEdge } from '../lib/types.js';
import { type RecallInputSchema } from '../schemas/inputs.js';
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

type RecallInput = z.infer<typeof RecallInputSchema>;
type RankedSeed = Pick<MemoryRow, 'hash' | 'rank'>;

interface RecallComputation {
  memories: Memory[];
  edges: RelationshipEdge[];
  depthReached: number;
  aborted: boolean;
  nextCursor?: string;
  seedCount: number;
  visitedCount: number;
}

const MEMORIES_BY_HASH_SQL =
  'SELECT * FROM memories WHERE hash IN (SELECT value FROM json_each(?))';

function loadMemoriesByHashes(
  db: TypedDb,
  hashes: readonly string[]
): MemoryRow[] {
  if (hashes.length === 0) {
    return [];
  }
  return db
    .prepareOnce<MemoryRow>(MEMORIES_BY_HASH_SQL)
    .all(JSON.stringify(hashes));
}

function formatRecallCompletionMessage(
  query: string,
  result: CallToolResult
): string {
  return formatToolCompletionMessage('recall', query, result, (payload) => {
    const memoriesCount = countPayloadArrayItems(payload, 'memories');
    const edgesCount = countPayloadArrayItems(payload, 'graph');
    const aborted = 'aborted' in payload && payload.aborted === true;
    return `${memoriesCount} memories, ${edgesCount} edges${aborted ? ' [aborted]' : ''}`;
  });
}

function decodeCursorForRecall(
  cursor: string | undefined,
  scope: string
): ReturnType<typeof decodeSearchCursor> | undefined {
  if (!cursor) {
    return undefined;
  }
  return decodeSearchCursor(cursor, scope);
}

function buildSeedRelevanceMap(
  seeds: readonly RankedSeed[]
): Map<string, number> {
  const seedRelevance = new Map<string, number>();
  for (const seed of seeds) {
    if (seed.rank != null) {
      seedRelevance.set(seed.hash, -seed.rank);
    }
  }
  return seedRelevance;
}

function toMemoriesWithRelevance(
  rows: readonly MemoryRow[],
  seedRelevance: ReadonlyMap<string, number>
): Memory[] {
  return rows.map((row) => {
    const memory = parseMemoryRow(row);
    const relevance = seedRelevance.get(memory.hash);
    if (relevance != null) {
      memory.relevance = relevance;
    }
    return memory;
  });
}

function buildNextCursor(
  hasMore: boolean,
  pageSeeds: readonly RankedSeed[],
  scope: string
): string | undefined {
  if (!hasMore || pageSeeds.length === 0) {
    return undefined;
  }

  const lastSeed = pageSeeds[pageSeeds.length - 1];
  if (!lastSeed) {
    return undefined;
  }

  const rank = lastSeed.rank ?? 0;
  return encodeSearchCursor(scope, rank, lastSeed.hash);
}

function createHopReporter(
  extra: ProgressContext,
  query: string,
  completionCurrent: number
): {
  reporter: ReturnType<typeof progressWithMessage>;
  onHop: ProgressNotifier;
} {
  const reporter = progressWithMessage(
    createProgressReporter(extra),
    ({ current, total }) =>
      `⊙ recall: ${query} [hop ${current}/${Math.max((total ?? current) - 1, current)}]`
  );

  const onHop: ProgressNotifier = (hop: number): void => {
    reporter({ current: hop + 1, total: completionCurrent });
  };

  return { reporter, onHop };
}

function toRecallResponse(computation: RecallComputation): CallToolResult {
  return createToolResponse({
    memories: computation.memories,
    graph: computation.edges,
    depth_reached: computation.depthReached,
    ...(computation.aborted ? { aborted: true } : {}),
    ...(computation.nextCursor ? { nextCursor: computation.nextCursor } : {}),
  });
}

async function computeRecall(
  db: TypedDb,
  params: RecallInput,
  scope: string,
  signal: AbortSignal | undefined,
  onHop: ProgressNotifier
): Promise<RecallComputation> {
  const decodedCursor = decodeCursorForRecall(params.cursor, scope);

  const seedRows = loadRankedSearchRows(
    db,
    params.query,
    params.limit,
    decodedCursor,
    toMemoryFilters(params)
  );
  const { page: pageSeeds, hasMore } = splitPage(seedRows, params.limit);

  const traversal = await traverseGraph(
    db,
    pageSeeds,
    params.depth,
    signal,
    onHop
  );

  const allHashes = Array.from(traversal.visited);
  const seedRelevance = buildSeedRelevanceMap(pageSeeds);
  const memoryRows = loadMemoriesByHashes(db, allHashes);
  const nextCursor = buildNextCursor(hasMore, pageSeeds, scope);

  return {
    memories: toMemoriesWithRelevance(memoryRows, seedRelevance),
    edges: traversal.edges,
    depthReached: traversal.depthReached,
    aborted: traversal.aborted,
    ...(nextCursor ? { nextCursor } : {}),
    seedCount: pageSeeds.length,
    visitedCount: traversal.visited.size,
  };
}

export function registerRecall(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'recall',
    async (params: RecallInput, extra: ProgressContext) => {
      const { depth } = params;
      const filters = toMemoryFilters(params);
      const scope = buildSearchCursorScope(params.query, filters);
      const contextLabel = `⊙ recall: ${params.query} [depth ${depth}]`;
      const completionCurrent = depth + 1;

      await notifyProgress(extra, {
        current: 0,
        total: completionCurrent,
        message: contextLabel,
      });

      const { reporter: hopReporter, onHop } = createHopReporter(
        extra,
        params.query,
        completionCurrent
      );

      return runWithProgressCompletion(
        extra,
        async () => {
          throwIfAborted(extra.signal);
          const computation = await computeRecall(
            db,
            params,
            scope,
            extra.signal,
            onHop
          );
          throwIfAborted(extra.signal);

          await logToolEvent(server, 'recall', {
            depth,
            depth_reached: computation.depthReached,
            seed_count: computation.seedCount,
            visited_nodes: computation.visitedCount,
            edge_count: computation.edges.length,
            aborted: computation.aborted,
          });

          return toRecallResponse(computation);
        },
        {
          reporter: hopReporter,
          completionCurrent,
          completionMessage: (result) =>
            formatRecallCompletionMessage(params.query, result),
        }
      );
    }
  );
}
