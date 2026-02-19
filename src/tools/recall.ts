import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import process from 'node:process';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage, rethrowMcpError } from '../lib/errors.js';
import { splitPage } from '../lib/pagination.js';
import {
  buildSearchCursorScope,
  decodeSearchCursor,
  encodeSearchCursor,
} from '../lib/search-cursor.js';
import {
  buildAndWhereClause,
  buildFilterClauses,
  sanitizeFtsQuery,
} from '../lib/search.js';
import type { MemoryFilters } from '../lib/search.js';
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
import { toMemoryFilters } from './helpers.js';
import {
  createProgressReporter,
  notifyProgress,
  progressWithMessage,
} from './progress.js';
import { getToolResultPayload, isOkStructuredToolResult } from './result.js';

type RecallInput = z.infer<typeof RecallInputSchema>;
type ProgressNotifier = (hop: number, total: number) => void;

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

function loadSeedRows(
  db: TypedDb,
  query: string,
  limit: number,
  cursor:
    | {
        mode: 'offset';
        offset: number;
      }
    | {
        mode: 'keyset';
        rank: number;
        hash: string;
      }
    | undefined,
  filters: MemoryFilters
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  const filter = buildFilterClauses(filters);
  const whereExtra = buildAndWhereClause(filter.clauses);
  if (!cursor || cursor.mode === 'offset') {
    const offset = cursor?.offset ?? 0;
    return db
      .prepareOnce<MemoryRow>(
        `SELECT m.*, memories_fts.rank AS rank FROM memories m
         JOIN memories_fts ON memories_fts.rowid = m.rowid
         WHERE memories_fts MATCH ?${whereExtra}
         ORDER BY memories_fts.rank, m.hash
         LIMIT ? OFFSET ?`
      )
      .all(ftsQuery, ...filter.params, limit + 1, offset);
  }

  return db
    .prepareOnce<MemoryRow>(
      `SELECT m.*, memories_fts.rank AS rank FROM memories m
       JOIN memories_fts ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?${whereExtra}
         AND (
           memories_fts.rank > ?
           OR (memories_fts.rank = ? AND m.hash > ?)
         )
       ORDER BY memories_fts.rank, m.hash
       LIMIT ?`
    )
    .all(
      ftsQuery,
      ...filter.params,
      cursor.rank,
      cursor.rank,
      cursor.hash,
      limit + 1
    );
}

function traverseGraph(
  db: TypedDb,
  seeds: MemoryRow[],
  depth: number,
  signal?: AbortSignal,
  onHop?: ProgressNotifier
): {
  edges: RelationshipEdge[];
  visited: Set<string>;
  depthReached: number;
  aborted: boolean;
} {
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

  for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }

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
    const edgeRows = db
      .prepareOnce<EdgeRow>(EDGE_QUERY_SQL)
      .all(frontierJson, frontierJson, remainingEdgeBudget + 1);
    const rowsToProcess =
      edgeRows.length > remainingEdgeBudget
        ? remainingEdgeBudget
        : edgeRows.length;
    if (edgeRows.length > remainingEdgeBudget) {
      aborted = true;
    }

    const nextHashes: string[] = [];
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

      if (!visited.has(edge.from_hash)) {
        if (visited.size >= MAX_VISITED_NODES) {
          aborted = true;
          break;
        }

        visited.add(edge.from_hash);
        if (nextHashes.length < MAX_FRONTIER_SIZE) {
          nextHashes.push(edge.from_hash);
        } else {
          aborted = true;
        }
      }

      if (!visited.has(edge.to_hash)) {
        if (visited.size >= MAX_VISITED_NODES) {
          aborted = true;
          break;
        }

        visited.add(edge.to_hash);
        if (nextHashes.length < MAX_FRONTIER_SIZE) {
          nextHashes.push(edge.to_hash);
        } else {
          aborted = true;
        }
      }

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
    return failedMessage;
  }
  if (!isOkStructuredToolResult(result)) {
    return failedMessage;
  }

  const payload = getToolResultPayload(result);
  if (!payload) {
    return `⊙ recall: ${query} • completed`;
  }

  const memoriesCount =
    'memories' in payload && Array.isArray(payload.memories)
      ? payload.memories.length
      : 0;
  const edgesCount =
    'graph' in payload && Array.isArray(payload.graph)
      ? payload.graph.length
      : 0;
  const aborted = 'aborted' in payload && payload.aborted === true;

  return `⊙ recall: ${query} • ${memoriesCount} memories, ${edgesCount} edges${aborted ? ' [aborted]' : ''}`;
}

export function registerRecall(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'recall',
    {
      title: 'Recall (BFS Graph Traversal)',
      description:
        'Search memories by full-text query, then traverse the relationship graph up to `depth` hops via BFS. Returns all discovered memories and the edges connecting them. Query terms are matched individually; FTS5 phrase operators and negation are not supported.',
      inputSchema: RecallInputSchema,
      outputSchema: RecallResultSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (params: RecallInput, extra) => {
      const { depth, limit, cursor } = params;
      const filters = toMemoryFilters(params);
      const scope = buildSearchCursorScope(params.query, filters);
      const decodedCursor = cursor
        ? decodeSearchCursor(cursor, scope)
        : undefined;
      const contextLabel = `⊙ recall: ${params.query} [depth ${depth}]`;
      const completionCurrent = depth + 1;

      await notifyProgress(extra, {
        current: 0,
        total: completionCurrent,
        message: contextLabel,
      });

      const hopReporter = progressWithMessage(
        createProgressReporter(extra),
        ({ current, total }) =>
          `⊙ recall: ${params.query} [hop ${current}/${total ?? current}]`
      );

      const onHop: ProgressNotifier = (hop: number, total: number): void => {
        hopReporter({ current: hop + 1, total });
      };

      let result: CallToolResult;
      try {
        // Step 1: FTS seed search
        const seedRows = loadSeedRows(
          db,
          params.query,
          limit,
          decodedCursor,
          filters
        );
        const { page: pageSeeds, hasMore } = splitPage(seedRows, limit);

        // Step 2: BFS traversal up to `depth` hops
        const traversal = traverseGraph(
          db,
          pageSeeds,
          depth,
          extra.signal,
          onHop
        );

        // Step 3: Load all discovered memory rows
        const allHashes = Array.from(traversal.visited);
        const seedRelevance = new Map<string, number>();
        for (const seed of pageSeeds) {
          if (seed.rank != null) seedRelevance.set(seed.hash, -seed.rank);
        }
        const memoryRows = loadMemoriesByHashes(db, allHashes);
        const memories: Memory[] = [];
        for (const row of memoryRows) {
          const memory = parseMemoryRow(row);
          const rel = seedRelevance.get(memory.hash);
          if (rel != null) {
            memory.relevance = rel;
          }
          memories.push(memory);
        }

        let nextCursor: string | undefined;
        if (hasMore && pageSeeds.length > 0) {
          const lastSeed = pageSeeds[pageSeeds.length - 1];
          if (lastSeed !== undefined) {
            const rank = lastSeed.rank ?? 0;
            nextCursor = encodeSearchCursor(scope, rank, lastSeed.hash);
          }
        }

        result = createToolResponse({
          memories,
          graph: traversal.edges,
          depth_reached: traversal.depthReached,
          ...(traversal.aborted ? { aborted: true } : {}),
          ...(nextCursor ? { nextCursor } : {}),
        });
      } catch (err) {
        rethrowMcpError(err);
        result = createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }

      await notifyProgress(extra, {
        current: completionCurrent,
        total: completionCurrent,
        message: formatRecallCompletionMessage(params.query, result),
      });

      return result;
    }
  );
}
