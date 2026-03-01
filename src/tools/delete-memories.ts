import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import { DELETE_MEMORY_SQL } from '../lib/sql.js';
import { executeToolSafely, summarizeBatch } from '../lib/tool-execution.js';
import { createToolResponse } from '../lib/tool-response.js';
import type { BatchItemResult } from '../lib/types.js';
import { type DeleteMemoriesInputSchema } from '../schemas/inputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';

type DeleteMemoriesInput = z.infer<typeof DeleteMemoriesInputSchema>;

async function notifyDeletedResources(
  server: McpServer,
  items: readonly BatchItemResult[]
): Promise<void> {
  // MCP spec (v2025-11-25) has no 'deleted' resource notification;
  // 'updated' is the closest available signal to inform clients.
  const notifications = items
    .filter((item) => item.deleted)
    .map((item) => notifyMemoryResourceUpdated(server, item.hash));
  await Promise.allSettled(notifications);
}

export function registerDeleteMemories(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'delete_memories',
    wrapToolHandler(
      async (params: DeleteMemoriesInput) =>
        executeToolSafely(async () => {
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
          const summary = summarizeBatch(
            results,
            (item) => item.deleted === true
          );

          await logToolEvent(server, 'delete_memories', {
            total: params.hashes.length,
            deleted: summary.matched,
          });
          await notifyDeletedResources(server, results);

          return createToolResponse({
            items: results,
            succeeded: summary.succeeded,
            failed: summary.failed,
          });
        }),
      {
        progressMessage: (params: DeleteMemoriesInput) =>
          `⊖ delete_memories: ${params.hashes.length} hashes [batch]`,
      }
    )
  );
}
