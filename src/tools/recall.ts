import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { decodeCursor, encodeCursor } from '../lib/pagination.js';
import { sanitizeFtsQuery } from '../lib/search.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory, MemoryRow, RelationshipEdge } from '../lib/types.js';
import { RecallInputSchema } from '../schemas/inputs.js';
import { RecallResultSchema } from '../schemas/outputs.js';

type RecallInput = z.infer<typeof RecallInputSchema>;

interface EdgeRow {
  from_hash: string;
  to_hash: string;
  relation_type: string;
}

interface TotalRow {
  total: number;
}

function createPlaceholders(count: number): string {
  return new Array(count).fill('?').join(',');
}

export function registerRecall(server: McpServer, db: DatabaseSync): void {
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
        const ftsQuery = sanitizeFtsQuery(params.query);

        const seedRows = db
          .prepare(
            `SELECT m.* FROM memories m
             JOIN memories_fts ON memories_fts.rowid = m.rowid
             WHERE memories_fts MATCH ?
             ORDER BY memories_fts.rank
             LIMIT ? OFFSET ?`
          )
          .all(ftsQuery, limit + 1, offset) as unknown as MemoryRow[];

        const hasMore = seedRows.length > limit;
        const pageSeeds = hasMore ? seedRows.slice(0, limit) : seedRows;

        const totalRow = db
          .prepare(
            `SELECT COUNT(*) AS total FROM memories m
             JOIN memories_fts ON memories_fts.rowid = m.rowid
             WHERE memories_fts MATCH ?`
          )
          .get(ftsQuery) as unknown as TotalRow;

        // Step 2: BFS traversal up to `depth` hops
        const visitedHashes = new Set<string>(pageSeeds.map((r) => r.hash));
        const allEdges: RelationshipEdge[] = [];
        let frontier: string[] = pageSeeds.map((r) => r.hash);

        for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
          const placeholders = createPlaceholders(frontier.length);
          const edgeRows = db
            .prepare(
              `SELECT from_hash, to_hash, relation_type FROM relationships
               WHERE from_hash IN (${placeholders}) OR to_hash IN (${placeholders})`
            )
            .all(...frontier, ...frontier) as unknown as EdgeRow[];

          const nextHashes: string[] = [];
          for (const edge of edgeRows) {
            allEdges.push({
              from_hash: edge.from_hash,
              to_hash: edge.to_hash,
              relation_type: edge.relation_type,
            });
            for (const h of [edge.from_hash, edge.to_hash]) {
              if (!visitedHashes.has(h)) {
                visitedHashes.add(h);
                nextHashes.push(h);
              }
            }
          }
          frontier = nextHashes;
        }

        // Step 3: Load all discovered memory rows
        const allHashes = Array.from(visitedHashes);
        let memories: Memory[] = [];

        if (allHashes.length > 0) {
          const placeholders = createPlaceholders(allHashes.length);
          const memRows = db
            .prepare(`SELECT * FROM memories WHERE hash IN (${placeholders})`)
            .all(...allHashes) as unknown as MemoryRow[];
          memories = memRows.map(parseMemoryRow);
        }

        const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

        return createToolResponse({
          ok: true,
          result: {
            memories,
            edges: allEdges,
            total: totalRow.total,
            nextCursor,
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
