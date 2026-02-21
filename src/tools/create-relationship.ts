import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import {
  E_NOT_FOUND,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { logToolEvent } from '../lib/mcp-utils.js';
import { getToolContract } from '../lib/tool-contracts.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type CreateRelationshipInputSchema } from '../schemas/inputs.js';
import { type CreateRelationshipResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type CreateRelInput = z.infer<typeof CreateRelationshipInputSchema>;
const INSERT_RELATIONSHIP_SQL = `INSERT OR IGNORE INTO relationships (from_hash, to_hash, relation_type, created_at)
  VALUES (?, ?, ?, ?)`;
const SELECT_HASHES_SQL =
  'SELECT hash FROM memories WHERE hash IN (?, ?) LIMIT 2';

function formatMemoryNotFound(kind: 'Source' | 'Target', hash: string): string {
  return `${kind} memory not found: ${hash}`;
}

function getMissingEndpoint(
  db: TypedDb,
  params: Pick<CreateRelInput, 'from_hash' | 'to_hash'>
): { kind: 'Source' | 'Target'; hash: string } | undefined {
  const rows = db
    .prepareOnce<{ hash: string }>(SELECT_HASHES_SQL)
    .all(params.from_hash, params.to_hash);
  const found = new Set(rows.map((row) => row.hash));

  if (!found.has(params.from_hash)) {
    return { kind: 'Source', hash: params.from_hash };
  }

  if (!found.has(params.to_hash)) {
    return { kind: 'Target', hash: params.to_hash };
  }

  return undefined;
}

export function registerCreateRelationship(
  server: McpServer,
  db: TypedDb
): void {
  const contract = getToolContract('create_relationship');
  server.registerTool(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema as typeof CreateRelationshipInputSchema,
      outputSchema:
        contract.outputSchema as typeof CreateRelationshipResultSchema,
      annotations: contract.annotations,
    },
    wrapToolHandler(
      async (params: CreateRelInput) => {
        try {
          const missing = getMissingEndpoint(db, params);
          if (missing) {
            return createErrorResponse(
              E_NOT_FOUND,
              formatMemoryNotFound(missing.kind, missing.hash)
            );
          }

          const now = new Date().toISOString();
          const result = db
            .prepareOnce(INSERT_RELATIONSHIP_SQL)
            .run(params.from_hash, params.to_hash, params.relation_type, now);

          const created = result.changes > 0;

          await logToolEvent(server, 'create_relationship', {
            fromHash: params.from_hash,
            toHash: params.to_hash,
            relationType: params.relation_type,
            created,
          });

          return createToolResponse({ created });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: CreateRelInput) =>
          `⊕ create_relationship: ${params.from_hash.slice(0, 8)}... -> ${params.to_hash.slice(0, 8)}... [${params.relation_type}]`,
      }
    )
  );
}
