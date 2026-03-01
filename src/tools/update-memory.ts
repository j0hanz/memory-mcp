import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_CONFLICT, E_NOT_FOUND } from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import {
  SELECT_MEMORY_BY_HASH_SQL,
  SELECT_MEMORY_HASH_SQL,
} from '../lib/sql.js';
import { executeToolSafely } from '../lib/tool-execution.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type MemoryRow, parseTags } from '../lib/types.js';
import { type UpdateMemoryInputSchema } from '../schemas/inputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';
import { formatHashPreview } from './result.js';

type UpdateInput = z.infer<typeof UpdateMemoryInputSchema>;

const UPDATE_MEMORY_SQL = `UPDATE memories
  SET hash = ?, content = ?, tags = ?, updated_at = ?
  WHERE hash = ?`;

type TransactionResult =
  | { ok: true; oldHash: string; newHash: string }
  | { ok: false; code: string; message: string };

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
  registerToolWithContract(
    server,
    'update_memory',
    wrapToolHandler(
      async (params: UpdateInput) =>
        executeToolSafely(async () => {
          // All reads and the write are inside a single IMMEDIATE transaction
          // to prevent TOCTOU between existence/collision checks and UPDATE.
          const txResult = db.transaction((): TransactionResult => {
            const existing = db
              .prepareOnce<MemoryRow>(SELECT_MEMORY_BY_HASH_SQL)
              .get(params.hash);

            if (!existing) {
              return {
                ok: false,
                code: E_NOT_FOUND,
                message: `Memory not found: ${params.hash}`,
              };
            }

            const newContent = params.content ?? existing.content;
            const newTags = params.tags ?? parseTags(existing.tags);
            const newHash = computeMemoryHash(newContent, newTags);

            if (newHash !== params.hash) {
              const collision = db
                .prepareOnce(SELECT_MEMORY_HASH_SQL)
                .get(newHash);
              if (collision) {
                return {
                  ok: false,
                  code: E_CONFLICT,
                  message: `Memory already exists for target content/tags: ${newHash}`,
                };
              }
            }

            const now = new Date().toISOString();
            db.prepareOnce(UPDATE_MEMORY_SQL).run(
              newHash,
              newContent,
              JSON.stringify(newTags),
              now,
              params.hash
            );

            return { ok: true, oldHash: params.hash, newHash };
          });

          if (!txResult.ok) {
            return createErrorResponse(txResult.code, txResult.message);
          }

          await logToolEvent(server, 'update', {
            oldHash: txResult.oldHash,
            newHash: txResult.newHash,
          });
          await notifyUpdatedMemoryResources(
            server,
            txResult.oldHash,
            txResult.newHash
          );

          return createToolResponse({
            old_hash: txResult.oldHash,
            new_hash: txResult.newHash,
          });
        }),
      {
        progressMessage: (params: UpdateInput) =>
          `⊜ update_memory: ${formatHashPreview(params.hash)} [replace content]`,
      }
    )
  );
}
