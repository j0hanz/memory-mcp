import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
import type { Memory, MemoryRow } from '../lib/types.js';
import { SearchMemoriesInputSchema } from '../schemas/inputs.js';
import { SearchResultSchema } from '../schemas/outputs.js';

type SearchInput = z.infer<typeof SearchMemoriesInputSchema>;

function loadSearchRows(
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

export function registerSearchMemories(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'search_memories',
    {
      title: 'Search Memories',
      description:
        'Full-text search over memory content and tags using FTS5. Returns ranked results with pagination support via cursor.',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: SearchResultSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (params: SearchInput) => {
      try {
        const {
          limit,
          cursor,
          min_importance: minImportance,
          max_importance: maxImportance,
          memory_type: memoryType,
        } = params;
        const offset = cursor ? decodeCursor(cursor) : 0;
        const rows = loadSearchRows(db, params.query, limit, offset, {
          min_importance: minImportance,
          max_importance: maxImportance,
          memory_type: memoryType,
        });
        const { page: pageRows, hasMore } = splitPage(rows, limit);

        const memories: Memory[] = pageRows.map(parseMemoryRow);
        const nextCursor = hasMore ? encodeCursor(offset + limit) : undefined;

        return createToolResponse({
          ok: true,
          result: {
            memories,
            total_returned: memories.length,
            ...(nextCursor ? { nextCursor } : {}),
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
