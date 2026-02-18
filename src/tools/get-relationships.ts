import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import type { z } from 'zod/v4';

import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { MemoryRow, RelationshipRow } from '../lib/types.js';
import { GetRelationshipsInputSchema } from '../schemas/inputs.js';
import { RelationshipResultSchema } from '../schemas/outputs.js';

type GetRelInput = z.infer<typeof GetRelationshipsInputSchema>;

interface RelWithMemory extends RelationshipRow {
  content: string;
  tags: string;
  memory_type: string;
  importance: number;
  created_at_mem: string;
  updated_at: string;
}

function loadOutgoingRelationships(
  db: DatabaseSync,
  hash: string
): RelWithMemory[] {
  return db
    .prepare(
      `SELECT r.from_hash, r.to_hash, r.relation_type, r.created_at,
              m.content, m.tags, m.memory_type, m.importance,
              m.created_at AS created_at_mem, m.updated_at
       FROM relationships r
       JOIN memories m ON r.to_hash = m.hash
       WHERE r.from_hash = ?
       ORDER BY r.created_at DESC`
    )
    .all(hash) as unknown as RelWithMemory[];
}

function loadIncomingRelationships(
  db: DatabaseSync,
  hash: string
): RelWithMemory[] {
  return db
    .prepare(
      `SELECT r.from_hash, r.to_hash, r.relation_type, r.created_at,
              m.content, m.tags, m.memory_type, m.importance,
              m.created_at AS created_at_mem, m.updated_at
       FROM relationships r
       JOIN memories m ON r.from_hash = m.hash
       WHERE r.to_hash = ?
       ORDER BY r.created_at DESC`
    )
    .all(hash) as unknown as RelWithMemory[];
}

export function registerGetRelationships(
  server: McpServer,
  db: DatabaseSync
): void {
  server.registerTool(
    'get_relationships',
    {
      title: 'Get Relationships',
      description:
        'Retrieve all relationships for a memory, with the related memory inlined. Filter by direction (outgoing | incoming | both).',
      inputSchema: GetRelationshipsInputSchema,
      outputSchema: RelationshipResultSchema,
      annotations: { readOnlyHint: true },
    },
    (params: GetRelInput) => {
      try {
        const exists = db
          .prepare('SELECT hash FROM memories WHERE hash = ?')
          .get(params.hash) as Pick<MemoryRow, 'hash'> | undefined;

        if (!exists) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Memory not found: ${params.hash}`
          );
        }

        const { direction } = params;
        let rows: RelWithMemory[] = [];

        if (direction === 'outgoing' || direction === 'both') {
          const outgoing = loadOutgoingRelationships(db, params.hash);
          rows = rows.concat(outgoing);
        }

        if (direction === 'incoming' || direction === 'both') {
          const incoming = loadIncomingRelationships(db, params.hash);
          rows = rows.concat(incoming);
        }

        const relationships = rows.map((r) => ({
          fromHash: r.from_hash,
          toHash: r.to_hash,
          relationType: r.relation_type,
          createdAt: r.created_at,
          memory: {
            hash: direction === 'outgoing' ? r.to_hash : r.from_hash,
            content: r.content,
            tags: JSON.parse(r.tags) as string[],
            memoryType: r.memory_type,
            importance: r.importance,
            createdAt: r.created_at_mem,
            updatedAt: r.updated_at,
          },
        }));

        return createToolResponse({
          ok: true,
          result: { hash: params.hash, direction, relationships },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
