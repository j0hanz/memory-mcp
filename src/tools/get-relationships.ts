import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseTags } from '../lib/types.js';
import type { RelationshipRow } from '../lib/types.js';
import { GetRelationshipsInputSchema } from '../schemas/inputs.js';
import { RelationshipResultSchema } from '../schemas/outputs.js';
import { memoryExists } from './helpers.js';

type GetRelInput = z.infer<typeof GetRelationshipsInputSchema>;

interface RelWithLinkedMemory extends RelationshipRow {
  linked_hash: string;
  linked_content: string;
  linked_tags: string;
}

type RelationshipDirection = 'outgoing' | 'incoming';

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
    (params: GetRelInput) => {
      try {
        if (!memoryExists(db, params.hash)) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Memory not found: ${params.hash}`
          );
        }

        const { direction } = params;
        let rows: RelWithLinkedMemory[] = [];

        if (direction === 'outgoing' || direction === 'both') {
          const outgoing = loadRelationships(db, params.hash, 'outgoing');
          rows = rows.concat(outgoing);
        }

        if (direction === 'incoming' || direction === 'both') {
          const incoming = loadRelationships(db, params.hash, 'incoming');
          rows = rows.concat(incoming);
        }

        const relationships = rows.map((r) => ({
          from_hash: r.from_hash,
          to_hash: r.to_hash,
          relation_type: r.relation_type,
          created_at: r.created_at,
          linked_hash: r.linked_hash,
          linked_content: r.linked_content,
          linked_tags: parseTags(r.linked_tags),
        }));

        return createToolResponse({
          ok: true,
          result: { relationships, count: relationships.length },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
