import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { CreateRelationshipInputSchema } from '../schemas/inputs.js';
import { CreateRelationshipResultSchema } from '../schemas/outputs.js';
import { logToolEvent, memoryExists, nowIso } from './helpers.js';

type CreateRelInput = z.infer<typeof CreateRelationshipInputSchema>;

export function registerCreateRelationship(
  server: McpServer,
  db: TypedDb
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
        if (!memoryExists(db, params.from_hash)) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Source memory not found: ${params.from_hash}`
          );
        }

        if (!memoryExists(db, params.to_hash)) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Target memory not found: ${params.to_hash}`
          );
        }

        const now = nowIso();
        const result = db
          .prepare(
            `INSERT OR IGNORE INTO relationships (from_hash, to_hash, relation_type, created_at)
             VALUES (?, ?, ?, ?)`
          )
          .run(params.from_hash, params.to_hash, params.relation_type, now);

        const created = result.changes > 0;

        await logToolEvent(server, 'create_relationship', {
          fromHash: params.from_hash,
          toHash: params.to_hash,
          relationType: params.relation_type,
          created,
        });

        return createToolResponse({
          ok: true,
          result: {
            created,
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
