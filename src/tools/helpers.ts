import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TypedDb } from '../db/typed.js';
import type { MemoryFilters } from '../lib/search.js';
import type { BatchItemResult, MemoryRow } from '../lib/types.js';

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';

const DEFAULT_MEMORY_TYPE = 'general';
const MEMORY_RESOURCE_PREFIX = 'memory://memories/';
const SELECT_MEMORY_BY_HASH_SQL = 'SELECT * FROM memories WHERE hash = ?';
const SELECT_MEMORY_HASH_SQL = 'SELECT hash FROM memories WHERE hash = ?';

export async function logToolEvent(
  server: McpServer,
  logger: string,
  data: unknown,
  level: LogLevel = 'info'
): Promise<void> {
  if (!server.isConnected()) {
    return;
  }

  await server.sendLoggingMessage({ level, logger, data });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatMemoryNotFound(hash: string): string {
  return `Memory not found: ${hash}`;
}

export function normalizeMemoryType(memoryType?: string): string {
  return memoryType ?? DEFAULT_MEMORY_TYPE;
}

export function toMemoryFilters(params: {
  min_importance?: number | undefined;
  max_importance?: number | undefined;
  memory_type?: string | undefined;
}): MemoryFilters {
  const filters: MemoryFilters = {};
  if (params.min_importance != null) {
    filters.min_importance = params.min_importance;
  }
  if (params.max_importance != null) {
    filters.max_importance = params.max_importance;
  }
  if (params.memory_type != null) {
    filters.memory_type = params.memory_type;
  }
  return filters;
}

export function summarizeBatch(items: readonly BatchItemResult[]): {
  succeeded: number;
  failed: number;
} {
  const succeeded = items.filter((item) => item.ok).length;
  return { succeeded, failed: items.length - succeeded };
}

export function getMemoryRow(db: TypedDb, hash: string): MemoryRow | undefined {
  return db.prepareOnce<MemoryRow>(SELECT_MEMORY_BY_HASH_SQL).get(hash);
}

export function memoryExists(db: TypedDb, hash: string): boolean {
  return (
    db
      .prepareOnce<Pick<MemoryRow, 'hash'>>(SELECT_MEMORY_HASH_SQL)
      .get(hash) !== undefined
  );
}

export function withImmediateTransaction<T>(db: TypedDb, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export async function notifyMemoryResourceUpdated(
  server: McpServer,
  hash: string
): Promise<void> {
  if (!server.isConnected()) {
    return;
  }

  try {
    await server.server.sendResourceUpdated({
      uri: `${MEMORY_RESOURCE_PREFIX}${hash}`,
    });
  } catch {
    // best-effort notification
  }
}
