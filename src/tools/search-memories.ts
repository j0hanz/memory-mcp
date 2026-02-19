import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
import type { Memory, MemoryRow } from '../lib/types.js';
import { SearchMemoriesInputSchema } from '../schemas/inputs.js';
import { SearchResultSchema } from '../schemas/outputs.js';
import { toMemoryFilters } from './helpers.js';
import { wrapToolHandler } from './progress.js';

type SearchInput = z.infer<typeof SearchMemoriesInputSchema>;

function loadSearchRows(
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

export function registerSearchMemories(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'search_memories',
    {
      title: 'Search Memories',
      description:
        'Full-text search over memory content and tags using FTS5. Returns ranked results with pagination support via cursor. Query terms are matched individually; FTS5 phrase operators and negation are not supported.',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: SearchResultSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      (params: SearchInput) => {
        try {
          const { limit, cursor } = params;
          const filters = toMemoryFilters(params);
          const scope = buildSearchCursorScope(params.query, filters);
          const decodedCursor = cursor
            ? decodeSearchCursor(cursor, scope)
            : undefined;
          const rows = loadSearchRows(
            db,
            params.query,
            limit,
            decodedCursor,
            filters
          );
          const { page: pageRows, hasMore } = splitPage(rows, limit);

          const memories: Memory[] = [];
          for (const row of pageRows) {
            memories.push(parseMemoryRow(row));
          }
          let nextCursor: string | undefined;
          if (hasMore && pageRows.length > 0) {
            const lastRow = pageRows[pageRows.length - 1];
            if (lastRow !== undefined) {
              const rank = lastRow.rank ?? 0;
              nextCursor = encodeSearchCursor(scope, rank, lastRow.hash);
            }
          }

          return createToolResponse({
            memories,
            total_returned: memories.length,
            ...(nextCursor ? { nextCursor } : {}),
          });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: SearchInput) =>
          `⊙ search_memories: ${params.query} [limit ${params.limit}]`,
      }
    )
  );
}
