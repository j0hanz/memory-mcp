import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage, rethrowMcpError } from '../lib/errors.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import { DELETE_MEMORY_SQL } from '../lib/sql.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { DeleteMemoryInputSchema } from '../schemas/inputs.js';
import { DeleteResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';

type DeleteInput = z.infer<typeof DeleteMemoryInputSchema>;

function deleteByHash(db: TypedDb, hash: string): boolean {
  return db.prepareOnce(DELETE_MEMORY_SQL).run(hash).changes > 0;
}

export function registerDeleteMemory(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'delete_memory',
    DeleteMemoryInputSchema,
    DeleteResultSchema,
    wrapToolHandler(
      async (params: DeleteInput) => {
        try {
          const deleted = deleteByHash(db, params.hash);

          if (deleted) {
            await logToolEvent(server, 'delete', { hash: params.hash });
            await notifyMemoryResourceUpdated(server, params.hash);
          }

          return createToolResponse({ deleted, hash: params.hash });
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
