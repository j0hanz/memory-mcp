#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import process from 'node:process';

import { initTypedDatabase } from './db/index.js';
import { createServer } from './server.js';

const MEMORY_DB_PATH = process.env['MEMORY_DB_PATH'] ?? 'memory.db';
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

function formatFatalError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function registerShutdownHandlers(shutdown: () => void): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, shutdown);
  }
}

async function main(): Promise<void> {
  const db = initTypedDatabase(MEMORY_DB_PATH);
  const server = createServer(db);
  const transport = new StdioServerTransport();

  const shutdown = (): void => {
    db.close();
    process.exit(0);
  };

  registerShutdownHandlers(shutdown);

  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${formatFatalError(err)}\n`);
  process.exit(1);
});
