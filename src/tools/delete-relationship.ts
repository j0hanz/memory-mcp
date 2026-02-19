import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { DeleteRelationshipInputSchema } from '../schemas/inputs.js';
import { DeleteRelationshipResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type DeleteRelInput = z.infer<typeof DeleteRelationshipInputSchema>;

const DELETE_RELATIONSHIP_SQL =
  'DELETE FROM relationships WHERE from_hash = ? AND to_hash = ? AND relation_type = ?';
const DELETE_RELATIONSHIP_RESULT = { deleted: true };

function formatRelationship(
  params: Pick<DeleteRelInput, 'from_hash' | 'to_hash' | 'relation_type'>
): string {
  return `${params.from_hash} -[${params.relation_type}]-> ${params.to_hash}`;
}

function deleteRelationship(
  db: TypedDb,
  params: Pick<DeleteRelInput, 'from_hash' | 'to_hash' | 'relation_type'>
): boolean {
  return (
    db
      .prepare(DELETE_RELATIONSHIP_SQL)
      .run(params.from_hash, params.to_hash, params.relation_type).changes > 0
  );
}

export function registerDeleteRelationship(
  server: McpServer,
  db: TypedDb
): void {
  server.registerTool(
    'delete_relationship',
    {
      title: 'Delete Relationship',
      description: 'Remove a directed relationship between two memories.',
      inputSchema: DeleteRelationshipInputSchema,
      outputSchema: DeleteRelationshipResultSchema,
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      (params: DeleteRelInput) => {
        try {
          if (!deleteRelationship(db, params)) {
            return createErrorResponse(
              E_NOT_FOUND,
              `Relationship not found: ${formatRelationship(params)}`
            );
          }

          return createToolResponse({
            ok: true,
            result: DELETE_RELATIONSHIP_RESULT,
          });
        } catch (err) {
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: DeleteRelInput) =>
          `⊖ delete_relationship: ${params.from_hash.slice(0, 8)}... • ${params.to_hash.slice(0, 8)}... [${params.relation_type}]`,
      }
    )
  );
}
