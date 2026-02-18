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
import {
  logToolEvent,
  notifyMemoryResourceUpdated,
  withImmediateTransaction,
} from './helpers.js';

type DeleteMemoriesInput = z.infer<typeof DeleteMemoriesInputSchema>;

const DELETE_MEMORY_SQL = 'DELETE FROM memories WHERE hash = ?';

function summarizeBatch(items: readonly BatchItemResult[]): {
  succeeded: number;
  failed: number;
} {
  const succeeded = items.filter((item) => item.ok).length;
  return { succeeded, failed: items.length - succeeded };
}

export function registerDeleteMemories(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'delete_memories',
    {
      title: 'Delete Memories (Batch)',
      description:
        'Delete multiple memories by hash in a single atomic transaction. Returns per-item results indicating which hashes were deleted.',
      inputSchema: DeleteMemoriesInputSchema,
      outputSchema: BatchResultSchema,
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    async (params: DeleteMemoriesInput) => {
      try {
        const results = withImmediateTransaction(db, () => {
          const items: BatchItemResult[] = [];
          const stmt = db.prepare<unknown>(DELETE_MEMORY_SQL);
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
        const { succeeded, failed } = summarizeBatch(results);
        await logToolEvent(server, 'delete_memories', {
          total: params.hashes.length,
          deleted,
        });

        for (const item of results) {
          if (item.deleted) {
            await notifyMemoryResourceUpdated(server, item.hash);
          }
        }

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
