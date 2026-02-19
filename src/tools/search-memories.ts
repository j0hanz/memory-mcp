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
import { loadRankedSearchRows } from '../lib/search.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory } from '../lib/types.js';
import { SearchMemoriesInputSchema } from '../schemas/inputs.js';
import { SearchResultSchema } from '../schemas/outputs.js';
import { toMemoryFilters } from './helpers.js';
import { wrapToolHandler } from './progress.js';

type SearchInput = z.infer<typeof SearchMemoriesInputSchema>;

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
          const rows = loadRankedSearchRows(
            db,
            params.query,
            limit,
            decodedCursor,
            filters
          );
          const { page: pageRows, hasMore } = splitPage(rows, limit);

          const memories: Memory[] = pageRows.map(parseMemoryRow);
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
