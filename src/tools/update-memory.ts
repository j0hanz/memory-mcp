import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { MemoryRow } from '../lib/types.js';
import { UpdateMemoryInputSchema } from '../schemas/inputs.js';
import { UpdateResultSchema } from '../schemas/outputs.js';

type UpdateInput = z.infer<typeof UpdateMemoryInputSchema>;

export function registerUpdateMemory(
  server: McpServer,
  db: DatabaseSync
): void {
  server.registerTool(
    'update_memory',
    {
      title: 'Update Memory',
      description:
        'Replace the content of an existing memory identified by its hash. Tags may optionally be replaced. Returns the new hash.',
      inputSchema: UpdateMemoryInputSchema,
      outputSchema: UpdateResultSchema,
    },
    async (params: UpdateInput) => {
      try {
        const existing = db
          .prepare('SELECT * FROM memories WHERE hash = ?')
          .get(params.hash) as MemoryRow | undefined;

        if (!existing) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Memory not found: ${params.hash}`
          );
        }

        const existingTags = JSON.parse(existing.tags) as string[];
        const newTags = params.tags ?? existingTags;
        const newHash = computeMemoryHash(params.content, newTags);
        const now = new Date().toISOString();

        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(
            `UPDATE memories
             SET hash = ?, content = ?, tags = ?, updated_at = ?
             WHERE hash = ?`
          ).run(
            newHash,
            params.content,
            JSON.stringify(newTags),
            now,
            params.hash
          );

          db.exec('COMMIT');
        } catch (txErr) {
          db.exec('ROLLBACK');
          throw txErr;
        }

        if (server.isConnected()) {
          await server.sendLoggingMessage({
            level: 'info',
            logger: 'update',
            data: { oldHash: params.hash, newHash },
          });
        }

        await server.server.sendResourceUpdated({
          uri: `memory://memories/${params.hash}`,
        });

        return createToolResponse({
          ok: true,
          result: { oldHash: params.hash, newHash },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
