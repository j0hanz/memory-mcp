import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { DeleteMemoryInputSchema } from '../schemas/inputs.js';
import { DeleteResultSchema } from '../schemas/outputs.js';
import { logToolEvent, notifyMemoryResourceUpdated } from './helpers.js';
import { wrapToolHandler } from './progress.js';

type DeleteInput = z.infer<typeof DeleteMemoryInputSchema>;

const DELETE_MEMORY_SQL = 'DELETE FROM memories WHERE hash = ?';
function formatMemoryNotFound(hash: string): string {
  return `Memory not found: ${hash}`;
}

export function registerDeleteMemory(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'delete_memory',
    {
      title: 'Delete Memory',
      description:
        'Delete a single memory by its SHA-256 hash. Also removes any relationships involving it.',
      inputSchema: DeleteMemoryInputSchema,
      outputSchema: DeleteResultSchema,
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      async (params: DeleteInput) => {
        try {
          const result = db.prepare(DELETE_MEMORY_SQL).run(params.hash);

          if (result.changes === 0) {
            return createErrorResponse(
              E_NOT_FOUND,
              formatMemoryNotFound(params.hash)
            );
          }

          await logToolEvent(server, 'delete', { hash: params.hash });
          await notifyMemoryResourceUpdated(server, params.hash);

          return createToolResponse({
            ok: true,
            result: { deleted: true, hash: params.hash },
          });
        } catch (err) {
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: DeleteInput) =>
          `delete_memory: ${params.hash.slice(0, 12)}... [single]`,
      }
    )
  );
}
