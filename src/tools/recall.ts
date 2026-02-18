import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import { sanitizeFtsQuery } from '../lib/search.js';
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

const MAX_FRONTIER_SIZE = 1000;
const MAX_EDGE_ROWS = 5000;
const MAX_VISITED_NODES = 5000;

function createPlaceholders(count: number): string {
  return new Array(count).fill('?').join(',');
}

function loadSeedRows(
  db: TypedDb,
  query: string,
  limit: number,
  offset: number
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  return db
    .prepare<MemoryRow>(
      `SELECT m.* FROM memories m
       JOIN memories_fts ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?
       ORDER BY memories_fts.rank
       LIMIT ? OFFSET ?`
    )
    .all(ftsQuery, limit + 1, offset);
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
  depth: number
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
    (params: RecallInput) => {
      try {
        const { depth, limit, cursor } = params;
        const offset = cursor ? decodeCursor(cursor) : 0;

        // Step 1: FTS seed search
        const seedRows = loadSeedRows(db, params.query, limit, offset);
        const { page: pageSeeds, hasMore } = splitPage(seedRows, limit);

        // Step 2: BFS traversal up to `depth` hops
        const traversal = traverseGraph(db, pageSeeds, depth);

        // Step 3: Load all discovered memory rows
        const allHashes = Array.from(traversal.visited);
        const memories = loadMemoriesByHashes(db, allHashes);

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
