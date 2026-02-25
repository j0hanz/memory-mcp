#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

import { initTypedDatabase } from './db/index.js';
import { getErrorMessage } from './lib/errors.js';
import { createServer } from './server.js';

const DEFAULT_DB_PATH = 'memory_db/memory.db';
const MEMORY_DB_PATH = process.env['MEMORY_DB_PATH'] ?? DEFAULT_DB_PATH;
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
const SHUTDOWN_TIMEOUT_MS = 3000;
const FORCED_EXIT_CODE = 1;
const CLEAN_EXIT_CODE = 0;
const LEGACY_DB_BASENAME = 'memory.db';
const DEFAULT_DB_DIR = 'memory_db';

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

function migrateLegacyDatabase(): void {
  if (process.env['MEMORY_DB_PATH']) return;

  if (!existsSync(LEGACY_DB_BASENAME) || existsSync(DEFAULT_DB_PATH)) return;

  try {
    mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });

    const filesToMove = [
      LEGACY_DB_BASENAME,
      `${LEGACY_DB_BASENAME}-shm`,
      `${LEGACY_DB_BASENAME}-wal`,
    ];

    for (const file of filesToMove) {
      if (existsSync(file)) {
        renameSync(file, `${DEFAULT_DB_DIR}/${file}`);
      }
    }
  } catch (err) {
    process.stderr.write(
      `Warning: Failed to migrate legacy database: ${getErrorMessage(err)}\n`
    );
  }
}

async function main(): Promise<void> {
  migrateLegacyDatabase();
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
