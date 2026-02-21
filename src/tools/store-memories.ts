import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage, rethrowMcpError } from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import { INSERT_MEMORY_SQL } from '../lib/sql.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { BatchItemResult } from '../lib/types.js';
import { StoreMemoriesInputSchema } from '../schemas/inputs.js';
import { BatchResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

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
  server.registerTool(
    'store_memories',
    {
      title: 'Store Memories (Batch)',
      description:
        'Store up to 50 memories atomically. Each item is independently idempotent — same content+tags returns existing hash with `created: false`. Returns per-item results. Transaction rolls back entirely on unexpected error.',
      inputSchema: StoreMemoriesInputSchema,
      outputSchema: BatchResultSchema,
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      async (params: StoreMemoriesInput) => {
        try {
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

          let created = 0;
          let succeeded = 0;
          for (const item of results) {
            if (item.ok) succeeded += 1;
            if (item.created) created += 1;
          }
          const failed = results.length - succeeded;

          await logToolEvent(server, 'store_memories', {
            total: results.length,
            created,
          });
          await notifyCreatedResources(server, results);

          return createToolResponse({ items: results, succeeded, failed });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: StoreMemoriesInput) =>
          `⊕ store_memories: ${params.items.length} items [batch]`,
      }
    )
  );
}
