import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import type { NewestRow, OldestRow, TotalRow, TypeRow } from '../lib/types.js';
import { MemoryStatsInputSchema } from '../schemas/inputs.js';
import { StatsResultSchema } from '../schemas/outputs.js';

function toTypeCounts(rows: TypeRow[]): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const row of rows) {
    byType[row.memory_type] = row.count;
  }
  return byType;
}

export function registerMemoryStats(server: McpServer, db: TypedDb): void {
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
          .prepare<TotalRow>('SELECT COUNT(*) AS total FROM memories')
          .get();

        const relationshipRow = db
          .prepare<TotalRow>('SELECT COUNT(*) AS total FROM relationships')
          .get();

        const typeRows = db
          .prepare<TypeRow>(
            'SELECT memory_type, COUNT(*) AS count FROM memories GROUP BY memory_type ORDER BY count DESC'
          )
          .all();

        const oldestRow = db
          .prepare<OldestRow>('SELECT MIN(created_at) AS oldest FROM memories')
          .get();

        const newestRow = db
          .prepare<NewestRow>('SELECT MAX(created_at) AS newest FROM memories')
          .get();

        const avgImportanceRow = db
          .prepare<{
            avg_importance: number | null;
          }>('SELECT AVG(importance) AS avg_importance FROM memories')
          .get();

        const byType = toTypeCounts(typeRows);

        return createToolResponse({
          ok: true,
          result: {
            memories: {
              total: totalRow?.total ?? 0,
              oldest: oldestRow?.oldest ?? null,
              newest: newestRow?.newest ?? null,
              avg_importance: avgImportanceRow?.avg_importance ?? null,
            },
            relationships: {
              total: relationshipRow?.total ?? 0,
            },
            by_type: byType,
          },
        });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
