import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { StoreMemoryInputSchema } from '../schemas/inputs.js';
import { StoreResultSchema } from '../schemas/outputs.js';
import { logToolEvent } from './helpers.js';

type StoreInput = z.infer<typeof StoreMemoryInputSchema>;

export function registerStoreMemory(server: McpServer, db: DatabaseSync): void {
  server.registerTool(
    'store_memory',
    {
      title: 'Store Memory',
      description:
        'Store a new memory with content, tags, and optional type/importance. Returns the SHA-256 hash. Idempotent — storing the same content+tags returns the existing hash with created:false.',
      inputSchema: StoreMemoryInputSchema,
      outputSchema: StoreResultSchema,
      annotations: { idempotentHint: true },
    },
    async (params: StoreInput) => {
      try {
        const { importance } = params;
        const memoryType = params.memory_type ?? 'general';
        const hash = computeMemoryHash(params.content, params.tags);
        const now = new Date().toISOString();
        const tagsJson = JSON.stringify(params.tags);

        const insertResult = db
          .prepare(
            `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            hash,
            params.content,
            tagsJson,
            memoryType,
            importance,
            now,
            now
          );

        const created = insertResult.changes > 0;
        await logToolEvent(server, 'store', { hash, created });

        return createToolResponse({ ok: true, result: { hash, created } });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
