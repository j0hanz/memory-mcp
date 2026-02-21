import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import {
  E_NOT_FOUND,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import { DELETE_MEMORY_SQL } from '../lib/sql.js';
import { getToolContract } from '../lib/tool-contracts.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type DeleteMemoryInputSchema } from '../schemas/inputs.js';
import { type DeleteResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type DeleteInput = z.infer<typeof DeleteMemoryInputSchema>;

function deleteByHash(db: TypedDb, hash: string): boolean {
  return db.prepareOnce(DELETE_MEMORY_SQL).run(hash).changes > 0;
}

export function registerDeleteMemory(server: McpServer, db: TypedDb): void {
  const contract = getToolContract('delete_memory');
  server.registerTool(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema as typeof DeleteMemoryInputSchema,
      outputSchema: contract.outputSchema as typeof DeleteResultSchema,
      annotations: contract.annotations,
    },
    wrapToolHandler(
      async (params: DeleteInput) => {
        try {
          if (!deleteByHash(db, params.hash)) {
            return createErrorResponse(
              E_NOT_FOUND,
              `Memory not found: ${params.hash}`
            );
          }

          await logToolEvent(server, 'delete', { hash: params.hash });
          await notifyMemoryResourceUpdated(server, params.hash);

          return createToolResponse({ deleted: true, hash: params.hash });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: DeleteInput) =>
          `⊖ delete_memory: ${params.hash.slice(0, 12)}... [single]`,
      }
    )
  );
}
