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
import type { BatchItemResult } from '../lib/types.js';
import { DeleteMemoriesInputSchema } from '../schemas/inputs.js';
import { BatchResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type DeleteMemoriesInput = z.infer<typeof DeleteMemoriesInputSchema>;

async function notifyDeletedResources(
  server: McpServer,
  items: readonly BatchItemResult[]
): Promise<void> {
  const notifications = items
    .filter((item) => item.deleted)
    .map((item) => notifyMemoryResourceUpdated(server, item.hash));
  await Promise.allSettled(notifications);
}

export function registerDeleteMemories(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'delete_memories',
    {
      title: 'Delete Memories (Batch)',
      description:
        'Delete up to 50 memories atomically. Cascade-deletes all relationships for each hash. Per-item `deleted: false` means the hash was not found — not an error, the batch still succeeds. Transaction rolls back entirely on unexpected error.',
      inputSchema: DeleteMemoriesInputSchema,
      outputSchema: BatchResultSchema,
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      async (params: DeleteMemoriesInput) => {
        try {
          const results = db.transaction(() => {
            const items: BatchItemResult[] = [];
            const stmt = db.prepareOnce<unknown>(DELETE_MEMORY_SQL);
            for (const hash of params.hashes) {
              const result = stmt.run(hash);
              items.push({
                hash,
                ok: true,
                deleted: result.changes > 0,
              });
            }
            return items;
          });

          let deleted = 0;
          let succeeded = 0;
          for (const item of results) {
            if (item.ok) succeeded += 1;
            if (item.deleted) deleted += 1;
          }
          const failed = results.length - succeeded;

          await logToolEvent(server, 'delete_memories', {
            total: params.hashes.length,
            deleted,
          });
          await notifyDeletedResources(server, results);

          return createToolResponse({ items: results, succeeded, failed });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: DeleteMemoriesInput) =>
          `⊖ delete_memories: ${params.hashes.length} hashes [batch]`,
      }
    )
  );
}
