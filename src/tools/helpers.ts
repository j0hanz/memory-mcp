import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TypedDb } from '../db/typed.js';
import type { MemoryRow } from '../lib/types.js';

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';

const DEFAULT_MEMORY_TYPE = 'general';

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

export function normalizeMemoryType(memoryType?: string): string {
  return memoryType ?? DEFAULT_MEMORY_TYPE;
}

export function getMemoryRow(db: TypedDb, hash: string): MemoryRow | undefined {
  return db
    .prepare<MemoryRow>('SELECT * FROM memories WHERE hash = ?')
    .get(hash);
}

export function memoryExists(db: TypedDb, hash: string): boolean {
  return (
    db
      .prepare<
        Pick<MemoryRow, 'hash'>
      >('SELECT hash FROM memories WHERE hash = ?')
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
