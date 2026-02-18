#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import process from 'node:process';

import { initDatabase } from './db/index.js';
import { createServer } from './server.js';

const MEMORY_DB_PATH = process.env['MEMORY_DB_PATH'] ?? 'memory.db';

async function main(): Promise<void> {
  const db = initDatabase(MEMORY_DB_PATH);
  const server = createServer(db);
  const transport = new StdioServerTransport();

  const shutdown = (): void => {
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
