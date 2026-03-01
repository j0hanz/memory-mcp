import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND } from '../lib/errors.js';
import { SELECT_MEMORY_HASH_SQL } from '../lib/sql.js';
import { executeToolSafely } from '../lib/tool-execution.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseTags } from '../lib/types.js';
import type { RelationshipRow, RelationshipWithMemory } from '../lib/types.js';
import { GetRelationshipsInputSchema } from '../schemas/inputs.js';
import { RelationshipResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';
import { formatHashPreview } from './result.js';

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
// Exclude self-loops from the second branch to avoid duplicate rows.
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
    AND r.from_hash != ?
  ORDER BY 4 DESC`;

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
    return db.prepareOnce<RelWithLinkedMemory>(BOTH_SQL).all(hash, hash, hash);
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
  registerToolWithContract(
    server,
    'get_relationships',
    GetRelationshipsInputSchema,
    RelationshipResultSchema,
    wrapToolHandler(
      (params: GetRelInput) =>
        executeToolSafely(() => {
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
        }),
      {
        progressMessage: (params: GetRelInput) =>
          `⊙ get_relationships: ${formatHashPreview(params.hash)} [${params.direction}]`,
      }
    )
  );
}
