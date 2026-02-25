import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import {
  E_NOT_FOUND,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { SELECT_MEMORY_BY_HASH_SQL } from '../lib/sql.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type MemoryRow, parseMemoryRow } from '../lib/types.js';
import { GetMemoryInputSchema } from '../schemas/inputs.js';
import { MemoryResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';

type GetInput = z.infer<typeof GetMemoryInputSchema>;

function getMemoryRow(db: TypedDb, hash: string): MemoryRow | undefined {
  return db.prepareOnce<MemoryRow>(SELECT_MEMORY_BY_HASH_SQL).get(hash);
}

function notFound(hash: string): ReturnType<typeof createErrorResponse> {
  return createErrorResponse(E_NOT_FOUND, `Memory not found: ${hash}`);
}

export function registerGetMemory(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'get_memory',
    GetMemoryInputSchema,
    MemoryResultSchema,
    wrapToolHandler(
      (params: GetInput) => {
        try {
          const row = getMemoryRow(db, params.hash);

          if (!row) {
            return notFound(params.hash);
          }

          const memory = parseMemoryRow(row);
          return createToolResponse({ ...memory });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: GetInput) =>
          `⊙ get_memory: ${params.hash.slice(0, 12)}... [single]`,
      }
    )
  );
}
