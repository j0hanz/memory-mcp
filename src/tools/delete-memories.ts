import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { BatchItemResult } from '../lib/types.js';
import { DeleteMemoriesInputSchema } from '../schemas/inputs.js';
import { BatchResultSchema } from '../schemas/outputs.js';

type DeleteMemoriesInput = z.infer<typeof DeleteMemoriesInputSchema>;

export function registerDeleteMemories(
  server: McpServer,
  db: DatabaseSync
): void {
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
        const results: BatchItemResult[] = [];

        db.exec('BEGIN IMMEDIATE');
        try {
          const stmt = db.prepare('DELETE FROM memories WHERE hash = ?');
          for (const hash of params.hashes) {
            const result = stmt.run(hash);
            results.push({
              hash,
              ok: true,
              created: false,
              deleted: result.changes > 0,
            });
          }
          db.exec('COMMIT');
        } catch (txErr) {
          db.exec('ROLLBACK');
          throw txErr;
        }

        const deleted = results.filter((r) => r.deleted).length;
        if (server.isConnected()) {
          await server.sendLoggingMessage({
            level: 'info',
            logger: 'delete_memories',
            data: { total: params.hashes.length, deleted },
          });
        }

        return createToolResponse({ ok: true, result: { items: results } });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
