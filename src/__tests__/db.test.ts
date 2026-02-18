import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { before, describe, it } from 'node:test';

import { initDatabase } from '../db/index.js';

const MEMORIES_TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'";
const RELATIONSHIPS_TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'";
const MEMORIES_FTS_TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'";

function queryTableName(db: DatabaseSync, sql: string): string | undefined {
  return (db.prepare(sql).get() as { name: string } | undefined)?.name;
}

describe('initDatabase', () => {
  let db: DatabaseSync;

  before(() => {
    db = initDatabase(':memory:');
  });

  it('creates the memories table', () => {
    assert.equal(queryTableName(db, MEMORIES_TABLE_QUERY), 'memories');
  });

  it('creates the relationships table', () => {
    assert.equal(
      queryTableName(db, RELATIONSHIPS_TABLE_QUERY),
      'relationships'
    );
  });

  it('creates the memories_fts virtual table', () => {
    assert.equal(queryTableName(db, MEMORIES_FTS_TABLE_QUERY), 'memories_fts');
  });

  it('can insert and retrieve a memory row', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('a'.repeat(64), 'test content', '["test"]', 'general', 0, now, now);

    const row = db
      .prepare('SELECT hash FROM memories WHERE hash = ?')
      .get('a'.repeat(64)) as { hash: string } | undefined;
    assert.equal(row?.hash, 'a'.repeat(64));
  });

  it('cascades deletes for relationships', () => {
    const now = new Date().toISOString();
    const h1 = 'b'.repeat(64);
    const h2 = 'c'.repeat(64);
    db.prepare(
      `INSERT INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      h1,
      'mem1',
      '[]',
      'general',
      0,
      now,
      now,
      h2,
      'mem2',
      '[]',
      'general',
      0,
      now,
      now
    );
    db.prepare(
      `INSERT INTO relationships (from_hash, to_hash, relation_type, created_at) VALUES (?, ?, ?, ?)`
    ).run(h1, h2, 'related_to', now);
    db.prepare('DELETE FROM memories WHERE hash = ?').run(h1);
    const rel = db
      .prepare('SELECT * FROM relationships WHERE from_hash = ?')
      .get(h1) as unknown;
    assert.equal(rel, undefined);
  });
});
