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
import { wrapToolHandler } from './progress.js';

interface AvgImportanceRow {
  avg_importance: number | null;
}

const TOTAL_MEMORIES_SQL = 'SELECT COUNT(*) AS total FROM memories';
const TOTAL_RELATIONSHIPS_SQL = 'SELECT COUNT(*) AS total FROM relationships';
const TYPE_COUNTS_SQL =
  'SELECT memory_type, COUNT(*) AS count FROM memories GROUP BY memory_type ORDER BY count DESC';
const OLDEST_MEMORY_SQL = 'SELECT MIN(created_at) AS oldest FROM memories';
const NEWEST_MEMORY_SQL = 'SELECT MAX(created_at) AS newest FROM memories';
const AVG_IMPORTANCE_SQL =
  'SELECT AVG(importance) AS avg_importance FROM memories';

function toTypeCounts(rows: TypeRow[]): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const row of rows) {
    byType[row.memory_type] = row.count;
  }
  return byType;
}

function getTotalCount(db: TypedDb, sql: string): number {
  return db.prepare<TotalRow>(sql).get()?.total ?? 0;
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
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrapToolHandler(
      () => {
        try {
          const totalMemories = getTotalCount(db, TOTAL_MEMORIES_SQL);
          const totalRelationships = getTotalCount(db, TOTAL_RELATIONSHIPS_SQL);

          const typeRows = db.prepare<TypeRow>(TYPE_COUNTS_SQL).all();

          const oldestRow = db.prepare<OldestRow>(OLDEST_MEMORY_SQL).get();

          const newestRow = db.prepare<NewestRow>(NEWEST_MEMORY_SQL).get();

          const avgImportanceRow = db
            .prepare<AvgImportanceRow>(AVG_IMPORTANCE_SQL)
            .get();

          const byType = toTypeCounts(typeRows);

          return createToolResponse({
            ok: true,
            result: {
              memories: {
                total: totalMemories,
                oldest: oldestRow?.oldest ?? null,
                newest: newestRow?.newest ?? null,
                avg_importance: avgImportanceRow?.avg_importance ?? null,
              },
              relationships: {
                total: totalRelationships,
              },
              by_type: byType,
            },
          });
        } catch (err) {
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      { progressMessage: () => '⊙ memory_stats: [aggregate]' }
    )
  );
}
