import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';

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

export function withImmediateTransaction<T>(
  db: DatabaseSync,
  action: () => T
): T {
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
