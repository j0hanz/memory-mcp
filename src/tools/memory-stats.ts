import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { MemoryStatsInputSchema } from '../schemas/inputs.js';
import { StatsResultSchema } from '../schemas/outputs.js';

interface CountRow {
  total: number;
}
interface TypeRow {
  memory_type: string;
  count: number;
}
interface OldestRow {
  oldest: string | null;
}
interface NewestRow {
  newest: string | null;
}

function toTypeCounts(rows: TypeRow[]): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const row of rows) {
    byType[row.memory_type] = row.count;
  }
  return byType;
}

export function registerMemoryStats(server: McpServer, db: DatabaseSync): void {
  server.registerTool(
    'memory_stats',
    {
      title: 'Memory Stats',
      description:
        'Return aggregate statistics about the memory store (counts, oldest/newest timestamps, breakdown by type).',
      inputSchema: MemoryStatsInputSchema,
      outputSchema: StatsResultSchema,
      annotations: { readOnlyHint: true },
    },
    () => {
      try {
        const totalRow = db
          .prepare('SELECT COUNT(*) AS total FROM memories')
          .get() as unknown as CountRow;

        const relationshipRow = db
          .prepare('SELECT COUNT(*) AS total FROM relationships')
          .get() as unknown as CountRow;

        const typeRows = db
          .prepare(
            'SELECT memory_type, COUNT(*) AS count FROM memories GROUP BY memory_type ORDER BY count DESC'
          )
          .all() as unknown as TypeRow[];

        const oldestRow = db
          .prepare('SELECT MIN(created_at) AS oldest FROM memories')
          .get() as unknown as OldestRow;

        const newestRow = db
          .prepare('SELECT MAX(created_at) AS newest FROM memories')
          .get() as unknown as NewestRow;

        const byType = toTypeCounts(typeRows);

        return createToolResponse({
          ok: true,
          result: {
            totalMemories: totalRow.total,
            totalRelationships: relationshipRow.total,
            byType,
            oldestCreatedAt: oldestRow.oldest,
            newestCreatedAt: newestRow.newest,
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
