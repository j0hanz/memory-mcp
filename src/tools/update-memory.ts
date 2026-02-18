import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseTags } from '../lib/types.js';
import { UpdateMemoryInputSchema } from '../schemas/inputs.js';
import { UpdateResultSchema } from '../schemas/outputs.js';
import {
  getMemoryRow,
  logToolEvent,
  nowIso,
  withImmediateTransaction,
} from './helpers.js';

type UpdateInput = z.infer<typeof UpdateMemoryInputSchema>;

export function registerUpdateMemory(server: McpServer, db: TypedDb): void {
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
        const existing = getMemoryRow(db, params.hash);

        if (!existing) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Memory not found: ${params.hash}`
          );
        }

        const existingTags = parseTags(existing.tags);
        const newTags = params.tags ?? existingTags;
        const newHash = computeMemoryHash(params.content, newTags);
        const now = nowIso();

        withImmediateTransaction(db, () => {
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
        });
        await logToolEvent(server, 'update', {
          oldHash: params.hash,
          newHash,
        });

        if (server.isConnected()) {
          try {
            await server.server.sendResourceUpdated({
              uri: `memory://memories/${params.hash}`,
            });
          } catch {
            // best-effort notification
          }
        }

        return createToolResponse({
          ok: true,
          result: { old_hash: params.hash, new_hash: newHash },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
