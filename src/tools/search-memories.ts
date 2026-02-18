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
import type { Memory, MemoryRow } from '../lib/types.js';
import { SearchMemoriesInputSchema } from '../schemas/inputs.js';
import { SearchResultSchema } from '../schemas/outputs.js';

type SearchInput = z.infer<typeof SearchMemoriesInputSchema>;

interface TotalRow {
  total: number;
}

export function registerSearchMemories(
  server: McpServer,
  db: DatabaseSync
): void {
  server.registerTool(
    'search_memories',
    {
      title: 'Search Memories',
      description:
        'Full-text search over memory content and tags using FTS5. Returns ranked results with pagination support via cursor.',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: SearchResultSchema,
      annotations: { readOnlyHint: true },
    },
    (params: SearchInput) => {
      try {
        const { limit, cursor } = params;
        const offset = cursor ? decodeCursor(cursor) : 0;

        const ftsQuery = sanitizeFtsQuery(params.query);

        const rows = db
          .prepare(
            `SELECT m.* FROM memories m
             JOIN memories_fts ON memories_fts.rowid = m.rowid
             WHERE memories_fts MATCH ?
             ORDER BY memories_fts.rank
             LIMIT ? OFFSET ?`
          )
          .all(ftsQuery, limit + 1, offset) as unknown as MemoryRow[];

        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;

        const totalRow = db
          .prepare(
            `SELECT COUNT(*) AS total FROM memories m
             JOIN memories_fts ON memories_fts.rowid = m.rowid
             WHERE memories_fts MATCH ?`
          )
          .get(ftsQuery) as unknown as TotalRow;

        const memories: Memory[] = pageRows.map(parseMemoryRow);
        const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

        return createToolResponse({
          ok: true,
          result: {
            memories,
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
