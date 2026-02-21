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
import { getToolContract } from '../lib/tool-contracts.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type MemoryRow, parseMemoryRow } from '../lib/types.js';
import { type GetMemoryInputSchema } from '../schemas/inputs.js';
import { type MemoryResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type GetInput = z.infer<typeof GetMemoryInputSchema>;

function getMemoryRow(db: TypedDb, hash: string): MemoryRow | undefined {
  return db.prepareOnce<MemoryRow>(SELECT_MEMORY_BY_HASH_SQL).get(hash);
}

function notFound(hash: string): ReturnType<typeof createErrorResponse> {
  return createErrorResponse(E_NOT_FOUND, `Memory not found: ${hash}`);
}

export function registerGetMemory(server: McpServer, db: TypedDb): void {
  const contract = getToolContract('get_memory');
  server.registerTool(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema as typeof GetMemoryInputSchema,
      outputSchema: contract.outputSchema as typeof MemoryResultSchema,
      annotations: contract.annotations,
    },
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
