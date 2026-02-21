import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import {
  E_NOT_FOUND,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { SELECT_MEMORY_HASH_SQL } from '../lib/sql.js';
import { getToolContract } from '../lib/tool-contracts.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseTags } from '../lib/types.js';
import type { RelationshipRow, RelationshipWithMemory } from '../lib/types.js';
import { type GetRelationshipsInputSchema } from '../schemas/inputs.js';
import { type RelationshipResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type GetRelInput = z.infer<typeof GetRelationshipsInputSchema>;
type RelationshipDirectionMode = GetRelInput['direction'];

interface RelWithLinkedMemory extends RelationshipRow {
  linked_hash: string;
  linked_content: string;
  linked_tags: string;
}

// Pre-defined SQL for each direction mode to maximise prepareOnce cache hits.
const OUTGOING_SQL = `
  SELECT r.from_hash, r.to_hash, r.relation_type, r.created_at,
         m.hash AS linked_hash, m.content AS linked_content, m.tags AS linked_tags
  FROM relationships r
  JOIN memories m ON r.to_hash = m.hash
  WHERE r.from_hash = ?
  ORDER BY r.created_at DESC`;

const INCOMING_SQL = `
  SELECT r.from_hash, r.to_hash, r.relation_type, r.created_at,
         m.hash AS linked_hash, m.content AS linked_content, m.tags AS linked_tags
  FROM relationships r
  JOIN memories m ON r.from_hash = m.hash
  WHERE r.to_hash = ?
  ORDER BY r.created_at DESC`;

// UNION ALL for 'both': single round-trip instead of two separate queries.
const BOTH_SQL = `
  SELECT r.from_hash, r.to_hash, r.relation_type, r.created_at,
         m.hash AS linked_hash, m.content AS linked_content, m.tags AS linked_tags
  FROM relationships r
  JOIN memories m ON r.to_hash = m.hash
  WHERE r.from_hash = ?
  UNION ALL
  SELECT r.from_hash, r.to_hash, r.relation_type, r.created_at,
         m.hash AS linked_hash, m.content AS linked_content, m.tags AS linked_tags
  FROM relationships r
  JOIN memories m ON r.from_hash = m.hash
  WHERE r.to_hash = ?
  ORDER BY created_at DESC`;

function memoryExists(db: TypedDb, hash: string): boolean {
  return (
    db.prepareOnce<{ hash: string }>(SELECT_MEMORY_HASH_SQL).get(hash) !==
    undefined
  );
}

function loadRelationships(
  db: TypedDb,
  hash: string,
  direction: RelationshipDirectionMode
): RelWithLinkedMemory[] {
  if (direction === 'both') {
    return db.prepareOnce<RelWithLinkedMemory>(BOTH_SQL).all(hash, hash);
  }
  const sql = direction === 'outgoing' ? OUTGOING_SQL : INCOMING_SQL;
  return db.prepareOnce<RelWithLinkedMemory>(sql).all(hash);
}

function toRelationshipWithMemory(
  row: RelWithLinkedMemory
): RelationshipWithMemory {
  return {
    from_hash: row.from_hash,
    to_hash: row.to_hash,
    relation_type: row.relation_type,
    created_at: row.created_at,
    linked_hash: row.linked_hash,
    linked_content: row.linked_content,
    linked_tags: parseTags(row.linked_tags),
  };
}

export function registerGetRelationships(server: McpServer, db: TypedDb): void {
  const contract = getToolContract('get_relationships');
  server.registerTool(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema as typeof GetRelationshipsInputSchema,
      outputSchema: contract.outputSchema as typeof RelationshipResultSchema,
      annotations: contract.annotations,
    },
    wrapToolHandler(
      (params: GetRelInput) => {
        try {
          if (!memoryExists(db, params.hash)) {
            return createErrorResponse(
              E_NOT_FOUND,
              `Memory not found: ${params.hash}`
            );
          }

          const rows = loadRelationships(db, params.hash, params.direction);
          const relationships: RelationshipWithMemory[] = rows.map(
            toRelationshipWithMemory
          );

          return createToolResponse({
            relationships,
            count: relationships.length,
          });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: GetRelInput) =>
          `⊙ get_relationships: ${params.hash.slice(0, 12)}... [${params.direction}]`,
      }
    )
  );
}
