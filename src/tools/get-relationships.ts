import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseTags } from '../lib/types.js';
import type { RelationshipRow, RelationshipWithMemory } from '../lib/types.js';
import { GetRelationshipsInputSchema } from '../schemas/inputs.js';
import { RelationshipResultSchema } from '../schemas/outputs.js';
import { memoryExists } from './helpers.js';
import { wrapToolHandler } from './progress.js';

type GetRelInput = z.infer<typeof GetRelationshipsInputSchema>;

interface RelWithLinkedMemory extends RelationshipRow {
  linked_hash: string;
  linked_content: string;
  linked_tags: string;
}

type RelationshipDirection = 'outgoing' | 'incoming';
type RelationshipDirectionMode = RelationshipDirection | 'both';

const DIRECTIONS_BY_MODE: Record<
  RelationshipDirectionMode,
  readonly RelationshipDirection[]
> = {
  outgoing: ['outgoing'],
  incoming: ['incoming'],
  both: ['outgoing', 'incoming'],
};

function loadRelationships(
  db: TypedDb,
  hash: string,
  direction: RelationshipDirection
): RelWithLinkedMemory[] {
  const joinCondition =
    direction === 'outgoing' ? 'r.to_hash = m.hash' : 'r.from_hash = m.hash';
  const whereColumn = direction === 'outgoing' ? 'r.from_hash' : 'r.to_hash';
  return db
    .prepare<RelWithLinkedMemory>(
      `SELECT r.from_hash, r.to_hash, r.relation_type, r.created_at,
              m.hash AS linked_hash, m.content AS linked_content, m.tags AS linked_tags
       FROM relationships r
       JOIN memories m ON ${joinCondition}
       WHERE ${whereColumn} = ?
       ORDER BY r.created_at DESC`
    )
    .all(hash);
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
  server.registerTool(
    'get_relationships',
    {
      title: 'Get Relationships',
      description:
        'Retrieve all relationships for a memory, with the related memory inlined. Filter by direction (outgoing | incoming | both).',
      inputSchema: GetRelationshipsInputSchema,
      outputSchema: RelationshipResultSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
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

          const directions = DIRECTIONS_BY_MODE[params.direction];
          const rows = directions.flatMap((direction) =>
            loadRelationships(db, params.hash, direction)
          );

          const relationships = rows.map(toRelationshipWithMemory);

          return createToolResponse({
            ok: true,
            result: { relationships, count: relationships.length },
          });
        } catch (err) {
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
