import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import process from 'node:process';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import { buildFilterClauses, sanitizeFtsQuery } from '../lib/search.js';
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

type RecallInput = z.infer<typeof RecallInputSchema>;

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

function createPlaceholders(count: number): string {
  return new Array(count).fill('?').join(',');
}

function loadSeedRows(
  db: TypedDb,
  query: string,
  limit: number,
  offset: number,
  filters: MemoryFilters
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  const filter = buildFilterClauses(filters);
  const whereExtra =
    filter.clauses.length > 0
      ? ` ${filter.clauses.map((c) => `AND ${c}`).join(' ')}`
      : '';
  return db
    .prepare<MemoryRow>(
      `SELECT m.*, memories_fts.rank AS rank FROM memories m
       JOIN memories_fts ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?${whereExtra}
       ORDER BY memories_fts.rank
       LIMIT ? OFFSET ?`
    )
    .all(ftsQuery, ...filter.params, limit + 1, offset);
}

function splitPage<T>(
  rows: T[],
  limit: number
): { page: T[]; hasMore: boolean } {
  if (rows.length > limit) {
    return { page: rows.slice(0, limit), hasMore: true };
  }
  return { page: rows, hasMore: false };
}

function traverseGraph(
  db: TypedDb,
  seeds: MemoryRow[],
  depth: number,
  signal?: AbortSignal
): {
  edges: RelationshipEdge[];
  visited: Set<string>;
  depthReached: number;
  aborted: boolean;
} {
  const visited = new Set<string>(seeds.map((r) => r.hash));
  const edges: RelationshipEdge[] = [];
  const seenEdges = new Set<string>();
  let frontier: string[] = seeds.map((r) => r.hash);
  let depthReached = 0;
  let aborted = false;

  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }
    depthReached = hop + 1;
    if (frontier.length > MAX_FRONTIER_SIZE) {
      frontier = frontier.slice(0, MAX_FRONTIER_SIZE);
      aborted = true;
    }
    const remainingEdgeBudget = MAX_EDGE_ROWS - edges.length;
    const remainingNodeBudget = MAX_VISITED_NODES - visited.size;
    if (remainingEdgeBudget <= 0 || remainingNodeBudget <= 0) {
      aborted = true;
      break;
    }

    const placeholders = createPlaceholders(frontier.length);
    const edgeRows = db
      .prepare<EdgeRow>(
        `SELECT from_hash, to_hash, relation_type FROM relationships
         WHERE from_hash IN (${placeholders}) OR to_hash IN (${placeholders})
         LIMIT ?`
      )
      .all(...frontier, ...frontier, remainingEdgeBudget + 1);

    const rows =
      edgeRows.length > remainingEdgeBudget
        ? edgeRows.slice(0, remainingEdgeBudget)
        : edgeRows;
    if (edgeRows.length > remainingEdgeBudget) {
      aborted = true;
    }

    const nextHashes: string[] = [];
    for (const edge of rows) {
      const edgeKey = `${edge.from_hash}|${edge.to_hash}|${edge.relation_type}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push({
          from_hash: edge.from_hash,
          to_hash: edge.to_hash,
          relation_type: edge.relation_type,
        });
      }

      for (const h of [edge.from_hash, edge.to_hash]) {
        if (!visited.has(h)) {
          if (visited.size >= MAX_VISITED_NODES) {
            aborted = true;
            break;
          }
          visited.add(h);
          if (nextHashes.length < MAX_FRONTIER_SIZE) {
            nextHashes.push(h);
          } else {
            aborted = true;
          }
        }
      }
      if (
        aborted &&
        (edges.length >= MAX_EDGE_ROWS || visited.size >= MAX_VISITED_NODES)
      ) {
        break;
      }
    }
    frontier = nextHashes;
  }

  return { edges, visited, depthReached, aborted };
}

function loadMemoriesByHashes(db: TypedDb, hashes: string[]): Memory[] {
  if (hashes.length === 0) {
    return [];
  }
  const placeholders = createPlaceholders(hashes.length);
  const memRows = db
    .prepare<MemoryRow>(
      `SELECT * FROM memories WHERE hash IN (${placeholders})`
    )
    .all(...hashes);
  return memRows.map(parseMemoryRow);
}

export function registerRecall(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'recall',
    {
      title: 'Recall (BFS Graph Traversal)',
      description:
        'Search memories by full-text query, then traverse the relationship graph up to `depth` hops via BFS. Returns all discovered memories and the edges connecting them.',
      inputSchema: RecallInputSchema,
      outputSchema: RecallResultSchema,
      annotations: { readOnlyHint: true },
    },
    (params: RecallInput, { signal }: { signal?: AbortSignal }) => {
      try {
        const {
          depth,
          limit,
          cursor,
          min_importance: minImportance,
          max_importance: maxImportance,
          memory_type: memoryType,
        } = params;
        const offset = cursor ? decodeCursor(cursor) : 0;

        // Step 1: FTS seed search
        const seedRows = loadSeedRows(db, params.query, limit, offset, {
          min_importance: minImportance,
          max_importance: maxImportance,
          memory_type: memoryType,
        });
        const { page: pageSeeds, hasMore } = splitPage(seedRows, limit);

        // Step 2: BFS traversal up to `depth` hops
        const traversal = traverseGraph(db, pageSeeds, depth, signal);

        // Step 3: Load all discovered memory rows
        const allHashes = Array.from(traversal.visited);
        const seedRelevance = new Map<string, number>();
        for (const seed of pageSeeds) {
          if (seed.rank != null) seedRelevance.set(seed.hash, -seed.rank);
        }
        const memories = loadMemoriesByHashes(db, allHashes).map((m) => {
          const rel = seedRelevance.get(m.hash);
          return rel != null ? { ...m, relevance: rel } : m;
        });

        const nextCursor = hasMore ? encodeCursor(offset + limit) : undefined;

        return createToolResponse({
          ok: true,
          result: {
            memories,
            graph: traversal.edges,
            depth_reached: traversal.depthReached,
            ...(traversal.aborted ? { aborted: true } : {}),
            ...(nextCursor ? { nextCursor } : {}),
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
