import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { DeleteRelationshipInputSchema } from '../schemas/inputs.js';
import { DeleteRelationshipResultSchema } from '../schemas/outputs.js';

type DeleteRelInput = z.infer<typeof DeleteRelationshipInputSchema>;

function formatRelationship(
  params: Pick<DeleteRelInput, 'from_hash' | 'to_hash' | 'relation_type'>
): string {
  return `${params.from_hash} -[${params.relation_type}]-> ${params.to_hash}`;
}

export function registerDeleteRelationship(
  server: McpServer,
  db: DatabaseSync
): void {
  server.registerTool(
    'delete_relationship',
    {
      title: 'Delete Relationship',
      description: 'Remove a directed relationship between two memories.',
      inputSchema: DeleteRelationshipInputSchema,
      outputSchema: DeleteRelationshipResultSchema,
    },
    (params: DeleteRelInput) => {
      try {
        const result = db
          .prepare(
            'DELETE FROM relationships WHERE from_hash = ? AND to_hash = ? AND relation_type = ?'
          )
          .run(params.from_hash, params.to_hash, params.relation_type);

        if (result.changes === 0) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Relationship not found: ${formatRelationship(params)}`
          );
        }

        return createToolResponse({
          ok: true,
          result: {
            deleted: true,
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
