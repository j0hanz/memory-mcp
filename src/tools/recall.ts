import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type CallToolResult,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import process from 'node:process';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import {
  E_CANCELLED,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { logToolEvent } from '../lib/mcp-utils.js';
import { splitPage } from '../lib/pagination.js';
import {
  buildSearchCursorScope,
  decodeSearchCursor,
  encodeSearchCursor,
} from '../lib/search-cursor.js';
import { loadRankedSearchRows, toMemoryFilters } from '../lib/search.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type {
  EdgeRow,
  Memory,
  MemoryRow,
  RelationshipEdge,
} from '../lib/types.js';
import { RecallInputSchema } from '../schemas/inputs.js';
import { RecallResultSchema } from '../schemas/outputs.js';
import {
  createProgressReporter,
  notifyProgress,
  type ProgressContext,
  progressWithMessage,
} from './progress.js';
import { registerToolWithContract } from './register-contract.js';
import {
  countPayloadArrayItems,
  getToolResultPayload,
  getToolResultText,
  isOkStructuredToolResult,
} from './result.js';

type RecallInput = z.infer<typeof RecallInputSchema>;
type ProgressNotifier = (hop: number, total: number) => void;
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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new Error(E_CANCELLED);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function parseEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

const MAX_FRONTIER_SIZE = parseEnvInt(
  'RECALL_MAX_FRONTIER_SIZE',
  1000,
  100,
  50000
);
const MAX_EDGE_ROWS = parseEnvInt('RECALL_MAX_EDGE_ROWS', 5000, 100, 50000);
const MAX_VISITED_NODES = parseEnvInt(
  'RECALL_MAX_VISITED_NODES',
  5000,
  100,
  50000
);

const EDGE_QUERY_SQL = `SELECT from_hash, to_hash, relation_type FROM relationships
         WHERE from_hash IN (SELECT value FROM json_each(?))
            OR to_hash   IN (SELECT value FROM json_each(?))
         LIMIT ?`;

const MEMORIES_BY_HASH_SQL =
  'SELECT * FROM memories WHERE hash IN (SELECT value FROM json_each(?))';

async function traverseGraph(
  db: TypedDb,
  seeds: MemoryRow[],
  depth: number,
  signal?: AbortSignal,
  onHop?: ProgressNotifier
): Promise<{
  edges: RelationshipEdge[];
  visited: Set<string>;
  depthReached: number;
  aborted: boolean;
}> {
  const visited = new Set<string>();
  const frontier: string[] = [];
  for (const seed of seeds) {
    visited.add(seed.hash);
    frontier.push(seed.hash);
  }

  const edges: RelationshipEdge[] = [];
  const seenEdges = new Set<string>();
  let depthReached = 0;
  let aborted = false;
  const edgeStmt = db.prepareOnce<EdgeRow>(EDGE_QUERY_SQL);

  for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
    // Yield to event loop to allow progress notifications and cancellation
    await yieldToEventLoop();

    throwIfAborted(signal);

    depthReached = hop + 1;
    onHop?.(hop, depth);

    if (frontier.length > MAX_FRONTIER_SIZE) {
      frontier.length = MAX_FRONTIER_SIZE;
      aborted = true;
    }

    const remainingEdgeBudget = MAX_EDGE_ROWS - edges.length;
    const remainingNodeBudget = MAX_VISITED_NODES - visited.size;
    if (remainingEdgeBudget <= 0 || remainingNodeBudget <= 0) {
      aborted = true;
      break;
    }

    const frontierJson = JSON.stringify(frontier);
    const edgeRows = edgeStmt.all(
      frontierJson,
      frontierJson,
      remainingEdgeBudget + 1
    );
    const rowsToProcess =
      edgeRows.length > remainingEdgeBudget
        ? remainingEdgeBudget
        : edgeRows.length;
    if (edgeRows.length > remainingEdgeBudget) {
      aborted = true;
    }

    const nextHashes: string[] = [];
    const queueVisitedHash = (hash: string): void => {
      if (visited.has(hash)) {
        return;
      }

      if (visited.size >= MAX_VISITED_NODES) {
        aborted = true;
        return;
      }

      visited.add(hash);
      if (nextHashes.length < MAX_FRONTIER_SIZE) {
        nextHashes.push(hash);
        return;
      }

      aborted = true;
    };

    for (let i = 0; i < rowsToProcess; i += 1) {
      const edge = edgeRows[i];
      if (edge === undefined) {
        break;
      }
      const edgeKey = `${edge.from_hash}|${edge.to_hash}|${edge.relation_type}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push({
          from_hash: edge.from_hash,
          to_hash: edge.to_hash,
          relation_type: edge.relation_type,
        });
      }

      queueVisitedHash(edge.from_hash);
      queueVisitedHash(edge.to_hash);

      if (
        aborted &&
        (edges.length >= MAX_EDGE_ROWS || visited.size >= MAX_VISITED_NODES)
      ) {
        break;
      }
    }
    frontier.length = 0;
    frontier.push(...nextHashes);
  }

  return { edges, visited, depthReached, aborted };
}

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
  const failedMessage = `⊙ recall: ${query} • failed`;
  if (result.isError) {
    const text = getToolResultText(result);
    if (text.includes(E_CANCELLED)) {
      return `⊙ recall: ${query} • cancelled`;
    }
    return failedMessage;
  }
  if (!isOkStructuredToolResult(result)) {
    return failedMessage;
  }

  const payload = getToolResultPayload(result);
  if (!payload) {
    return `⊙ recall: ${query} • completed`;
  }

  const memoriesCount = countPayloadArrayItems(payload, 'memories');
  const edgesCount = countPayloadArrayItems(payload, 'graph');
  const aborted = 'aborted' in payload && payload.aborted === true;

  return `⊙ recall: ${query} • ${memoriesCount} memories, ${edgesCount} edges${aborted ? ' [aborted]' : ''}`;
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
    RecallInputSchema,
    RecallResultSchema,
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

      let result: CallToolResult | undefined;
      let thrownError: McpError | undefined;
      try {
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

        result = createToolResponse({
          memories: computation.memories,
          graph: computation.edges,
          depth_reached: computation.depthReached,
          ...(computation.aborted ? { aborted: true } : {}),
          ...(computation.nextCursor
            ? { nextCursor: computation.nextCursor }
            : {}),
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

      await hopReporter.flush();

      const completionResult =
        result ?? createErrorResponse(E_UNKNOWN, getErrorMessage(thrownError));

      await notifyProgress(extra, {
        current: completionCurrent,
        total: completionCurrent,
        message: formatRecallCompletionMessage(params.query, completionResult),
      });

      if (thrownError) {
        throw thrownError;
      }

      return completionResult;
    }
  );
}
