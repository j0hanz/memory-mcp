import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { splitPage } from '../lib/pagination.js';
import {
  buildSearchCursorScope,
  decodeSearchCursor,
  encodeSearchCursor,
} from '../lib/search-cursor.js';
import { loadRankedSearchRows, toMemoryFilters } from '../lib/search.js';
import { executeToolSafely } from '../lib/tool-execution.js';
import { createToolResponse } from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory, MemoryRow } from '../lib/types.js';
import { type SearchMemoriesInputSchema } from '../schemas/inputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';

type SearchInput = z.infer<typeof SearchMemoriesInputSchema>;

function buildNextCursorFromRows(
  scope: string,
  hasMore: boolean,
  pageRows: readonly MemoryRow[]
): string | undefined {
  if (!hasMore || pageRows.length === 0) {
    return undefined;
  }

  const lastRow = pageRows[pageRows.length - 1];
  if (!lastRow) {
    return undefined;
  }

  const rank = lastRow.rank ?? 0;
  return encodeSearchCursor(scope, rank, lastRow.hash);
}

export function registerSearchMemories(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'search_memories',
    wrapToolHandler(
      (params: SearchInput) =>
        executeToolSafely(() => {
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
          const nextCursor = buildNextCursorFromRows(scope, hasMore, pageRows);

          return createToolResponse({
            memories,
            total_returned: memories.length,
            ...(nextCursor ? { nextCursor } : {}),
          });
        }),
      {
        progressMessage: (params: SearchInput) =>
          `⊙ search_memories: ${params.query} [limit ${params.limit}]`,
      }
    )
  );
}
