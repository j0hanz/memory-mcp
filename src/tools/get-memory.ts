import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import type { MemoryRow } from '../lib/types.js';
import { GetMemoryInputSchema } from '../schemas/inputs.js';
import { MemoryResultSchema } from '../schemas/outputs.js';

type GetInput = z.infer<typeof GetMemoryInputSchema>;

function findMemoryByHash(
  db: DatabaseSync,
  hash: string
): MemoryRow | undefined {
  return db.prepare('SELECT * FROM memories WHERE hash = ?').get(hash) as
    | MemoryRow
    | undefined;
}

export function registerGetMemory(server: McpServer, db: DatabaseSync): void {
  server.registerTool(
    'get_memory',
    {
      title: 'Get Memory',
      description: 'Retrieve a single memory by its SHA-256 hash.',
      inputSchema: GetMemoryInputSchema,
      outputSchema: MemoryResultSchema,
      annotations: { readOnlyHint: true },
    },
    (params: GetInput) => {
      try {
        const row = findMemoryByHash(db, params.hash);

        if (!row) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Memory not found: ${params.hash}`
          );
        }

        return createToolResponse({ ok: true, result: parseMemoryRow(row) });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
