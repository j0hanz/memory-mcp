import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { MemoryRow } from '../lib/types.js';
import { CreateRelationshipInputSchema } from '../schemas/inputs.js';
import { CreateRelationshipResultSchema } from '../schemas/outputs.js';

type CreateRelInput = z.infer<typeof CreateRelationshipInputSchema>;

export function registerCreateRelationship(
  server: McpServer,
  db: DatabaseSync
): void {
  server.registerTool(
    'create_relationship',
    {
      title: 'Create Relationship',
      description:
        'Create a directed labeled edge between two memories. Idempotent — re-creating an existing relationship is a no-op.',
      inputSchema: CreateRelationshipInputSchema,
      outputSchema: CreateRelationshipResultSchema,
      annotations: { idempotentHint: true },
    },
    async (params: CreateRelInput) => {
      try {
        // Verify both memories exist
        const from = db
          .prepare('SELECT hash FROM memories WHERE hash = ?')
          .get(params.from_hash) as Pick<MemoryRow, 'hash'> | undefined;

        if (!from) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Source memory not found: ${params.from_hash}`
          );
        }

        const to = db
          .prepare('SELECT hash FROM memories WHERE hash = ?')
          .get(params.to_hash) as Pick<MemoryRow, 'hash'> | undefined;

        if (!to) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Target memory not found: ${params.to_hash}`
          );
        }

        const now = new Date().toISOString();
        const result = db
          .prepare(
            `INSERT OR IGNORE INTO relationships (from_hash, to_hash, relation_type, created_at)
             VALUES (?, ?, ?, ?)`
          )
          .run(params.from_hash, params.to_hash, params.relation_type, now);

        const created = result.changes > 0;

        if (server.isConnected()) {
          await server.sendLoggingMessage({
            level: 'info',
            logger: 'create_relationship',
            data: {
              fromHash: params.from_hash,
              toHash: params.to_hash,
              relationType: params.relation_type,
              created,
            },
          });
        }

        return createToolResponse({
          ok: true,
          result: {
            created,
            fromHash: params.from_hash,
            toHash: params.to_hash,
            relationType: params.relation_type,
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
