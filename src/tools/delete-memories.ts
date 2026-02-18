import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { BatchItemResult } from '../lib/types.js';
import { DeleteMemoriesInputSchema } from '../schemas/inputs.js';
import { BatchResultSchema } from '../schemas/outputs.js';
import { logToolEvent, withImmediateTransaction } from './helpers.js';

type DeleteMemoriesInput = z.infer<typeof DeleteMemoriesInputSchema>;

export function registerDeleteMemories(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'delete_memories',
    {
      title: 'Delete Memories (Batch)',
      description:
        'Delete multiple memories by hash in a single atomic transaction. Returns per-item results indicating which hashes were deleted.',
      inputSchema: DeleteMemoriesInputSchema,
      outputSchema: BatchResultSchema,
    },
    async (params: DeleteMemoriesInput) => {
      try {
        const results = withImmediateTransaction(db, () => {
          const items: BatchItemResult[] = [];
          const stmt = db.prepare<unknown>(
            'DELETE FROM memories WHERE hash = ?'
          );
          for (const hash of params.hashes) {
            const result = stmt.run(hash);
            items.push({
              hash,
              ok: true,
              created: false,
              deleted: result.changes > 0,
            });
          }
          return items;
        });

        const deleted = results.filter((r) => r.deleted).length;
        const succeeded = results.filter((r) => r.ok).length;
        const failed = results.length - succeeded;
        await logToolEvent(server, 'delete_memories', {
          total: params.hashes.length,
          deleted,
        });

        return createToolResponse({
          ok: true,
          result: { items: results, succeeded, failed },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
