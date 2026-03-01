import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TypedDb } from '../db/typed.js';
import {
  MEMORY_AGGREGATE_SQL,
  RELATIONSHIP_COUNT_SQL,
  TYPE_COUNTS_SQL,
} from '../lib/sql.js';
import { executeToolSafely } from '../lib/tool-execution.js';
import { createToolResponse } from '../lib/tool-response.js';
import type { TotalRow, TypeRow } from '../lib/types.js';
import { wrapToolHandler } from './progress.js';
import { registerToolWithContract } from './register-contract.js';

interface MemoryAggregateRow {
  total: number;
  oldest: string | null;
  newest: string | null;
  avg_importance: number | null;
}

function toTypeCounts(rows: TypeRow[]): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const row of rows) {
    byType[row.memory_type] = row.count;
  }
  return byType;
}

export function registerMemoryStats(server: McpServer, db: TypedDb): void {
  registerToolWithContract(
    server,
    'memory_stats',
    wrapToolHandler(
      () =>
        executeToolSafely(() => {
          const aggregate = db
            .prepareOnce<MemoryAggregateRow>(MEMORY_AGGREGATE_SQL)
            .get();

          const totalRelationships =
            db.prepareOnce<TotalRow>(RELATIONSHIP_COUNT_SQL).get()?.total ?? 0;

          const typeRows = db.prepareOnce<TypeRow>(TYPE_COUNTS_SQL).all();
          const byType = toTypeCounts(typeRows);

          return createToolResponse({
            memories: {
              total: aggregate?.total ?? 0,
              oldest: aggregate?.oldest ?? null,
              newest: aggregate?.newest ?? null,
              avg_importance: aggregate?.avg_importance ?? null,
            },
            relationships: {
              total: totalRelationships,
            },
            by_type: byType,
          });
        }),
      { progressMessage: () => '⊙ memory_stats: [aggregate]' }
    )
  );
}
