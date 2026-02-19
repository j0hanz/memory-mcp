#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import process from 'node:process';

import { initTypedDatabase } from './db/index.js';
import { getErrorMessage } from './lib/errors.js';
import { createServer } from './server.js';

const MEMORY_DB_PATH = process.env['MEMORY_DB_PATH'] ?? 'memory.db';
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
const SHUTDOWN_TIMEOUT_MS = 3000;
const FORCED_EXIT_CODE = 1;
const CLEAN_EXIT_CODE = 0;

function registerShutdownHandlers(shutdown: () => void): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, shutdown);
  }
}

function scheduleForcedShutdown(): NodeJS.Timeout {
  const timer = setTimeout(() => {
    process.stderr.write('Shutdown timed out, forcing exit.\n');
    process.exit(FORCED_EXIT_CODE);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();
  return timer;
}

async function closeServer(
  server: ReturnType<typeof createServer>
): Promise<void> {
  try {
    await server.close();
  } catch {
    // ignore close errors
  }
}

async function runShutdown(
  server: ReturnType<typeof createServer>,
  db: ReturnType<typeof initTypedDatabase>
): Promise<void> {
  const timer = scheduleForcedShutdown();
  try {
    await closeServer(server);
    db.close();
  } finally {
    clearTimeout(timer);
  }

  process.exit(CLEAN_EXIT_CODE);
}

function createShutdownHandler(
  server: ReturnType<typeof createServer>,
  db: ReturnType<typeof initTypedDatabase>
): () => void {
  let isShuttingDown = false;
  return () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    void runShutdown(server, db);
  };
}

async function main(): Promise<void> {
  const db = initTypedDatabase(MEMORY_DB_PATH);
  const server = createServer(db);
  const transport = new StdioServerTransport();
  const shutdown = createShutdownHandler(server, db);
  registerShutdownHandlers(shutdown);

  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${getErrorMessage(err)}\n`);
  process.exit(FORCED_EXIT_CODE);
});
