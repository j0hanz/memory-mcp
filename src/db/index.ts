import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLTagStore } from 'node:sqlite';

import { createTypedDb, type TypedDb } from './typed.js';

const SQLITE_TIMEOUT_MS = 5000;
const STATEMENT_CACHE_SIZE = 1000;
const FTS5_CHECK_SQL =
  'CREATE VIRTUAL TABLE IF NOT EXISTS __fts5_check USING fts5(x); DROP TABLE __fts5_check;';
const FTS5_REQUIRED_MESSAGE =
  'SQLite FTS5 extension is not available. memory-mcp requires a SQLite build with FTS5 support.';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS memories (
    hash TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    memory_type TEXT NOT NULL DEFAULT 'general',
    importance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    tags,
    content='memories',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, tags)
      VALUES (new.rowid, new.content, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, tags)
      VALUES ('delete', old.rowid, old.content, old.tags);
    INSERT INTO memories_fts(rowid, content, tags)
      VALUES (new.rowid, new.content, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, tags)
      VALUES ('delete', old.rowid, old.content, old.tags);
  END;

  CREATE TABLE IF NOT EXISTS relationships (
    from_hash TEXT NOT NULL REFERENCES memories(hash) ON DELETE CASCADE,
    to_hash TEXT NOT NULL REFERENCES memories(hash) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_hash, to_hash, relation_type)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_memories_importance
    ON memories(importance DESC);

  CREATE INDEX IF NOT EXISTS idx_memories_created
    ON memories(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_relationships_from
    ON relationships(from_hash);

  CREATE INDEX IF NOT EXISTS idx_relationships_to
    ON relationships(to_hash);
`;

function assertFts5Available(db: DatabaseSync): void {
  try {
    db.exec(FTS5_CHECK_SQL);
  } catch {
    throw new Error(FTS5_REQUIRED_MESSAGE);
  }
}

function ensureParentDir(path: string): void {
  const isInMemoryPath = path === ':memory:';
  if (isInMemoryPath) {
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
}

function configureDatabase(db: DatabaseSync): void {
  // Enable defensive mode (SQLite v3.39+ / Node 24.12+: prevents deliberate DB corruption)
  db.exec('PRAGMA defensive = ON');

  // Verify FTS5 support
  assertFts5Available(db);

  db.exec(SCHEMA_SQL);
}

export function initDatabase(path: string): DatabaseSync {
  ensureParentDir(path);

  const db = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    timeout: SQLITE_TIMEOUT_MS,
  });

  configureDatabase(db);

  return db;
}

export function initTypedDatabase(path: string): TypedDb {
  const db = initDatabase(path);
  return createTypedDb(db);
}

export function createStatementCache(db: DatabaseSync): SQLTagStore {
  return db.createTagStore(STATEMENT_CACHE_SIZE);
}
