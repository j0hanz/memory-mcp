import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createTypedDb, type TypedDb } from './typed.js';

const SQLITE_TIMEOUT_MS = 5000;
const TARGET_SCHEMA_VERSION = 2;
const FTS5_CHECK_SQL =
  'CREATE VIRTUAL TABLE IF NOT EXISTS __fts5_check USING fts5(x); DROP TABLE __fts5_check;';
const FTS5_REQUIRED_MESSAGE =
  'SQLite FTS5 extension is not available. memory-mcp requires a SQLite build with FTS5 support.';
const DEFENSIVE_PRAGMA_SQL = 'PRAGMA defensive = ON';
const RELATIONSHIPS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS relationships (
    from_hash TEXT NOT NULL REFERENCES memories(hash) ON DELETE CASCADE ON UPDATE CASCADE,
    to_hash TEXT NOT NULL REFERENCES memories(hash) ON DELETE CASCADE ON UPDATE CASCADE,
    relation_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_hash, to_hash, relation_type)
  ) STRICT;`;

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

  ${RELATIONSHIPS_TABLE_SQL}

  CREATE INDEX IF NOT EXISTS idx_memories_importance
    ON memories(importance DESC);

  CREATE INDEX IF NOT EXISTS idx_memories_created
    ON memories(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_relationships_from
    ON relationships(from_hash);

  CREATE INDEX IF NOT EXISTS idx_relationships_to
    ON relationships(to_hash);
`;

interface UserVersionRow {
  user_version: number;
}

interface ForeignKeyRow {
  table: string;
  from: string;
  on_update: string;
}

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

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as
    | UserVersionRow
    | undefined;
  return row?.user_version ?? 0;
}

function writeUserVersion(db: DatabaseSync, version: number): void {
  db.exec(`PRAGMA user_version = ${version}`);
}

function needsRelationshipsCascadeUpdateMigration(db: DatabaseSync): boolean {
  const rows = db
    .prepare("PRAGMA foreign_key_list('relationships')")
    .all() as unknown as ForeignKeyRow[];
  if (rows.length === 0) {
    return false;
  }

  for (const row of rows) {
    const isMemoryEdge =
      row.table === 'memories' &&
      (row.from === 'from_hash' || row.from === 'to_hash');
    if (!isMemoryEdge) {
      continue;
    }

    if (row.on_update.toUpperCase() !== 'CASCADE') {
      return true;
    }
  }

  return false;
}

function migrateRelationshipsCascadeUpdate(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('ALTER TABLE relationships RENAME TO relationships_old');
    db.exec(RELATIONSHIPS_TABLE_SQL.replace(' IF NOT EXISTS', ''));
    db.exec(`
      INSERT INTO relationships (from_hash, to_hash, relation_type, created_at)
      SELECT from_hash, to_hash, relation_type, created_at
      FROM relationships_old
    `);
    db.exec('DROP TABLE relationships_old');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_hash)'
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_hash)'
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function applyMigrations(db: DatabaseSync): void {
  const currentVersion = readUserVersion(db);
  const needsCascadeMigration = needsRelationshipsCascadeUpdateMigration(db);

  if (needsCascadeMigration) {
    migrateRelationshipsCascadeUpdate(db);
  }

  if (currentVersion < TARGET_SCHEMA_VERSION || needsCascadeMigration) {
    writeUserVersion(db, TARGET_SCHEMA_VERSION);
  }
}

function configureDatabase(db: DatabaseSync): void {
  // Enable defensive mode (SQLite v3.39+ / Node 24.12+: prevents deliberate DB corruption)
  db.exec(DEFENSIVE_PRAGMA_SQL);

  // WAL mode: allows concurrent readers without blocking writers. Persists in DB file.
  db.exec('PRAGMA journal_mode = WAL');

  // Verify FTS5 support
  assertFts5Available(db);

  db.exec(SCHEMA_SQL);
  applyMigrations(db);
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
