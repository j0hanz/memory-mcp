import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { BatchItemResult } from '../lib/types.js';
import { StoreMemoriesInputSchema } from '../schemas/inputs.js';
import { BatchResultSchema } from '../schemas/outputs.js';
import {
  logToolEvent,
  normalizeMemoryType,
  nowIso,
  summarizeBatch,
  withImmediateTransaction,
} from './helpers.js';
import { wrapToolHandler } from './progress.js';

type StoreMemoriesInput = z.infer<typeof StoreMemoriesInputSchema>;
const INSERT_MEMORY_SQL = `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

export function registerStoreMemories(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'store_memories',
    {
      title: 'Store Memories (Batch)',
      description:
        'Store up to 50 memories in a single atomic transaction. Returns per-item results so callers can detect partial failures. All items succeed or the transaction rolls back.',
      inputSchema: StoreMemoriesInputSchema,
      outputSchema: BatchResultSchema,
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      async (params: StoreMemoriesInput) => {
        try {
          const now = nowIso();
          const results = withImmediateTransaction(db, () => {
            const items: BatchItemResult[] = [];
            const stmt = db.prepare<unknown>(INSERT_MEMORY_SQL);

            for (const item of params.items) {
              const { importance, memory_type: rawMemoryType } = item;
              const memoryType = normalizeMemoryType(rawMemoryType);
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
              items.push({ hash, ok: true, created: result.changes > 0 });
            }
            return items;
          });

          const created = results.filter((r) => r.created).length;
          const { succeeded, failed } = summarizeBatch(results);
          await logToolEvent(server, 'store_memories', {
            total: results.length,
            created,
          });

          return createToolResponse({ items: results, succeeded, failed });
        } catch (err) {
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
