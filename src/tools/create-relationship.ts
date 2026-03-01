import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND } from '../lib/errors.js';
import { logToolEvent } from '../lib/mcp-utils.js';
import { executeToolSafely } from '../lib/tool-execution.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type CreateRelationshipInputSchema } from '../schemas/inputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';
import { formatRelationshipPreview } from './result.js';

type CreateRelInput = z.infer<typeof CreateRelationshipInputSchema>;
const INSERT_RELATIONSHIP_SQL = `INSERT OR IGNORE INTO relationships (from_hash, to_hash, relation_type, created_at)
  VALUES (?, ?, ?, ?)`;
const SELECT_HASHES_SQL =
  'SELECT hash FROM memories WHERE hash IN (?, ?) LIMIT 2';
type CreateRelationshipTxResult =
  | { ok: true; created: boolean }
  | { ok: false; code: string; message: string };

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

function createRelationshipTx(
  db: TypedDb,
  params: CreateRelInput
): CreateRelationshipTxResult {
  return db.transaction<CreateRelationshipTxResult>(() => {
    const missing = getMissingEndpoint(db, params);
    if (missing) {
      return {
        ok: false,
        code: E_NOT_FOUND,
        message: formatMemoryNotFound(missing.kind, missing.hash),
      };
    }

    const now = new Date().toISOString();
    const result = db
      .prepareOnce(INSERT_RELATIONSHIP_SQL)
      .run(params.from_hash, params.to_hash, params.relation_type, now);

    return { ok: true, created: result.changes > 0 };
  });
}

export function registerCreateRelationship(
  server: McpServer,
  db: TypedDb
): void {
  registerToolWithContract(
    server,
    'create_relationship',
    wrapToolHandler(
      async (params: CreateRelInput) =>
        executeToolSafely(async () => {
          const txResult = createRelationshipTx(db, params);
          if (!txResult.ok) {
            return createErrorResponse(txResult.code, txResult.message);
          }

          await logToolEvent(server, 'create_relationship', {
            fromHash: params.from_hash,
            toHash: params.to_hash,
            relationType: params.relation_type,
            created: txResult.created,
          });

          return createToolResponse({ created: txResult.created });
        }),
      {
        progressMessage: (params: CreateRelInput) =>
          `⊕ create_relationship: ${formatRelationshipPreview(params.from_hash, params.to_hash)} [${params.relation_type}]`,
      }
    )
  );
}
