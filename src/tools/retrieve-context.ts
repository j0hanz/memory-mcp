import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { sanitizeFtsQuery } from '../lib/search.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { Memory, MemoryRow } from '../lib/types.js';
import { RetrieveContextInputSchema } from '../schemas/inputs.js';
import { RetrieveContextResultSchema } from '../schemas/outputs.js';

type RetrieveContextInput = z.infer<typeof RetrieveContextInputSchema>;

const RETRIEVE_CONTEXT_LIMIT = 200;

function getOrderBy(strategy: string): string {
  if (strategy === 'importance') {
    return 'm.importance DESC, memories_fts.rank';
  }
  if (strategy === 'recency') {
    return 'm.created_at DESC, memories_fts.rank';
  }
  return 'memories_fts.rank';
}

function loadContextRows(
  db: TypedDb,
  query: string,
  orderBy: string
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  return db
    .prepare<MemoryRow>(
      `SELECT m.*, memories_fts.rank AS rank FROM memories m
       JOIN memories_fts ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?
       ORDER BY ${orderBy}
       LIMIT ${RETRIEVE_CONTEXT_LIMIT + 1}`
    )
    .all(ftsQuery);
}

export function registerRetrieveContext(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'retrieve_context',
    {
      title: 'Retrieve Context',
      description:
        'Search memories and return relevance-ranked results that fit within a caller-specified token budget. Eliminates manual pagination and token counting for context window management.',
      inputSchema: RetrieveContextInputSchema,
      outputSchema: RetrieveContextResultSchema,
      annotations: { readOnlyHint: true },
    },
    (params: RetrieveContextInput) => {
      try {
        const { query, strategy } = params;
        const tokenBudget = params.token_budget;
        const orderBy = getOrderBy(strategy);
        const rows = loadContextRows(db, query, orderBy);
        const rowCapExceeded = rows.length > RETRIEVE_CONTEXT_LIMIT;
        const candidateRows = rowCapExceeded
          ? rows.slice(0, RETRIEVE_CONTEXT_LIMIT)
          : rows;

        let estimatedTokens = 0;
        let truncated = rowCapExceeded;
        const selected: Memory[] = [];

        for (const row of candidateRows) {
          const mem = parseMemoryRow(row);
          const tokens = Math.ceil(mem.content.length / 4);
          if (estimatedTokens + tokens > tokenBudget) {
            truncated = true;
            break;
          }
          estimatedTokens += tokens;
          selected.push(mem);
        }

        return createToolResponse({
          ok: true,
          result: {
            memories: selected,
            estimated_tokens: estimatedTokens,
            truncated,
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
