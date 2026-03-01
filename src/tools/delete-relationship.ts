import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND } from '../lib/errors.js';
import { executeToolSafely } from '../lib/tool-execution.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { DeleteRelationshipInputSchema } from '../schemas/inputs.js';
import { DeleteRelationshipResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';
import { formatRelationshipPreview } from './result.js';

type DeleteRelInput = z.infer<typeof DeleteRelationshipInputSchema>;

const DELETE_RELATIONSHIP_SQL =
  'DELETE FROM relationships WHERE from_hash = ? AND to_hash = ? AND relation_type = ?';
const DELETE_RELATIONSHIP_RESULT = { deleted: true };

function formatRelationship(
  params: Pick<DeleteRelInput, 'from_hash' | 'to_hash' | 'relation_type'>
): string {
  return `${params.from_hash} -[${params.relation_type}]-> ${params.to_hash}`;
}

function createNotFoundRelationshipMessage(
  params: Pick<DeleteRelInput, 'from_hash' | 'to_hash' | 'relation_type'>
): string {
  return `Relationship not found: ${formatRelationship(params)}`;
}

function deleteRelationship(
  db: TypedDb,
  params: Pick<DeleteRelInput, 'from_hash' | 'to_hash' | 'relation_type'>
): boolean {
  return (
    db
      .prepareOnce(DELETE_RELATIONSHIP_SQL)
      .run(params.from_hash, params.to_hash, params.relation_type).changes > 0
  );
}

export function registerDeleteRelationship(
  server: McpServer,
  db: TypedDb
): void {
  registerToolWithContract(
    server,
    'delete_relationship',
    DeleteRelationshipInputSchema,
    DeleteRelationshipResultSchema,
    wrapToolHandler(
      (params: DeleteRelInput) =>
        executeToolSafely(() => {
          if (!deleteRelationship(db, params)) {
            return createErrorResponse(
              E_NOT_FOUND,
              createNotFoundRelationshipMessage(params)
            );
          }

          return createToolResponse(DELETE_RELATIONSHIP_RESULT);
        }),
      {
        progressMessage: (params: DeleteRelInput) =>
          `⊖ delete_relationship: ${formatRelationshipPreview(params.from_hash, params.to_hash)} [${params.relation_type}]`,
      }
    )
  );
}
