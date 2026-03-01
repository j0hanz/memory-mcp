import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { computeMemoryHash } from '../lib/hash.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import { INSERT_MEMORY_SQL } from '../lib/sql.js';
import { executeToolSafely, summarizeBatch } from '../lib/tool-execution.js';
import { createToolResponse } from '../lib/tool-response.js';
import type { BatchItemResult } from '../lib/types.js';
import { type StoreMemoriesInputSchema } from '../schemas/inputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';

type StoreMemoriesInput = z.infer<typeof StoreMemoriesInputSchema>;

async function notifyCreatedResources(
  server: McpServer,
  items: readonly BatchItemResult[]
): Promise<void> {
  const notifications = items
    .filter((item) => item.created)
    .map((item) => notifyMemoryResourceUpdated(server, item.hash));
  await Promise.allSettled(notifications);
}

export function registerStoreMemories(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'store_memories',
    wrapToolHandler(
      async (params: StoreMemoriesInput) =>
        executeToolSafely(async () => {
          const now = new Date().toISOString();
          const results = db.transaction(() => {
            const items: BatchItemResult[] = [];
            const stmt = db.prepareOnce<unknown>(INSERT_MEMORY_SQL);

            for (const item of params.items) {
              const { importance, memory_type: rawMemoryType } = item;
              const memoryType = rawMemoryType ?? 'general';
              const hash = computeMemoryHash(item.content, item.tags);
              const tagsJson = JSON.stringify(item.tags);
              const result = stmt.run(
                hash,
                item.content,
                tagsJson,
                memoryType,
                importance,
                now,
                now
              );
              items.push({
                hash,
                ok: true,
                created: result.changes > 0,
              });
            }
            return items;
          });
          const summary = summarizeBatch(
            results,
            (item) => item.created === true
          );

          await logToolEvent(server, 'store_memories', {
            total: results.length,
            created: summary.matched,
          });
          await notifyCreatedResources(server, results);

          return createToolResponse({
            items: results,
            succeeded: summary.succeeded,
            failed: summary.failed,
          });
        }),
      {
        progressMessage: (params: StoreMemoriesInput) =>
          `⊕ store_memories: ${params.items.length} items [batch]`,
      }
    )
  );
}
