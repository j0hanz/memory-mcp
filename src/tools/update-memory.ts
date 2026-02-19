import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import {
  E_CONFLICT,
  E_NOT_FOUND,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type MemoryRow, parseTags } from '../lib/types.js';
import { UpdateMemoryInputSchema } from '../schemas/inputs.js';
import { UpdateResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type UpdateInput = z.infer<typeof UpdateMemoryInputSchema>;
const UPDATE_MEMORY_SQL = `UPDATE memories
  SET hash = ?, content = ?, tags = ?, updated_at = ?
  WHERE hash = ?`;
const SELECT_MEMORY_BY_HASH_SQL = 'SELECT * FROM memories WHERE hash = ?';
const SELECT_MEMORY_HASH_SQL = 'SELECT hash FROM memories WHERE hash = ?';

async function notifyUpdatedMemoryResources(
  server: McpServer,
  oldHash: string,
  newHash: string
): Promise<void> {
  const notifications = [notifyMemoryResourceUpdated(server, oldHash)];
  if (newHash !== oldHash) {
    notifications.push(notifyMemoryResourceUpdated(server, newHash));
  }
  await Promise.allSettled(notifications);
}

export function registerUpdateMemory(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'update_memory',
    {
      title: 'Update Memory',
      description:
        'Replace the content of an existing memory identified by its hash. Tags may optionally be replaced. Returns the new hash.',
      inputSchema: UpdateMemoryInputSchema,
      outputSchema: UpdateResultSchema,
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      async (params: UpdateInput) => {
        try {
          const existing = db
            .prepareOnce<MemoryRow>(SELECT_MEMORY_BY_HASH_SQL)
            .get(params.hash);

          if (!existing) {
            return createErrorResponse(
              E_NOT_FOUND,
              `Memory not found: ${params.hash}`
            );
          }

          const newTags = params.tags ?? parseTags(existing.tags);
          const newHash = computeMemoryHash(params.content, newTags);

          if (newHash !== params.hash) {
            const collision = db
              .prepareOnce(SELECT_MEMORY_HASH_SQL)
              .get(newHash);
            if (collision) {
              return createErrorResponse(
                E_CONFLICT,
                `Memory already exists for target content/tags: ${newHash}`
              );
            }
          }

          const now = new Date().toISOString();

          db.transaction(() => {
            db.prepareOnce(UPDATE_MEMORY_SQL).run(
              newHash,
              params.content,
              JSON.stringify(newTags),
              now,
              params.hash
            );
          });

          await logToolEvent(server, 'update', {
            oldHash: params.hash,
            newHash,
          });
          await notifyUpdatedMemoryResources(server, params.hash, newHash);

          return createToolResponse({
            old_hash: params.hash,
            new_hash: newHash,
          });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: UpdateInput) =>
          `⊜ update_memory: ${params.hash.slice(0, 12)}... [replace content]`,
      }
    )
  );
}
