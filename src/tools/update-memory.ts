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
  formatMemoryNotFound,
  getMemoryRow,
  logToolEvent,
  notifyMemoryResourceUpdated,
  nowIso,
  withImmediateTransaction,
} from './helpers.js';
import { wrapToolHandler } from './progress.js';

type UpdateInput = z.infer<typeof UpdateMemoryInputSchema>;
const UPDATE_MEMORY_SQL = `UPDATE memories
  SET hash = ?, content = ?, tags = ?, updated_at = ?
  WHERE hash = ?`;

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
          const existing = getMemoryRow(db, params.hash);

          if (!existing) {
            return createErrorResponse(
              E_NOT_FOUND,
              formatMemoryNotFound(params.hash)
            );
          }

          const newTags = params.tags ?? parseTags(existing.tags);
          const newHash = computeMemoryHash(params.content, newTags);
          const now = nowIso();

          withImmediateTransaction(db, () => {
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

          await notifyMemoryResourceUpdated(server, params.hash);

          return createToolResponse({
            old_hash: params.hash,
            new_hash: newHash,
          });
        } catch (err) {
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
