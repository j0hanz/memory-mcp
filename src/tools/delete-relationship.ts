import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { executeToolSafely } from '../lib/tool-execution.js';
import { createToolResponse } from '../lib/tool-response.js';
import { type DeleteRelationshipInputSchema } from '../schemas/inputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';
import { formatRelationshipPreview } from './result.js';

type DeleteRelInput = z.infer<typeof DeleteRelationshipInputSchema>;

const DELETE_RELATIONSHIP_SQL =
  'DELETE FROM relationships WHERE from_hash = ? AND to_hash = ? AND relation_type = ?';
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
    wrapToolHandler(
      (params: DeleteRelInput) =>
        executeToolSafely(() => {
          const deleted = deleteRelationship(db, params);
          return createToolResponse({ deleted });
        }),
      {
        progressMessage: (params: DeleteRelInput) =>
          `⊖ delete_relationship: ${formatRelationshipPreview(params.from_hash, params.to_hash)} [${params.relation_type}]`,
      }
    )
  );
}
