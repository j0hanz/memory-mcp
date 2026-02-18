import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { DeleteMemoryInputSchema } from '../schemas/inputs.js';
import { DeleteResultSchema } from '../schemas/outputs.js';
import { logToolEvent } from './helpers.js';

type DeleteInput = z.infer<typeof DeleteMemoryInputSchema>;

export function registerDeleteMemory(
  server: McpServer,
  db: DatabaseSync
): void {
  server.registerTool(
    'delete_memory',
    {
      title: 'Delete Memory',
      description:
        'Delete a single memory by its SHA-256 hash. Also removes any relationships involving it.',
      inputSchema: DeleteMemoryInputSchema,
      outputSchema: DeleteResultSchema,
    },
    async (params: DeleteInput) => {
      try {
        const result = db
          .prepare('DELETE FROM memories WHERE hash = ?')
          .run(params.hash);

        if (result.changes === 0) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Memory not found: ${params.hash}`
          );
        }

        await logToolEvent(server, 'delete', { hash: params.hash });

        return createToolResponse({
          ok: true,
          result: { deleted: true, hash: params.hash },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
