import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';

const MEMORIES_TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'";
const RELATIONSHIPS_TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'";
const MEMORIES_FTS_TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'";

function queryTableName(db: TypedDb, sql: string): string | undefined {
  return db.prepare<{ name: string }>(sql).get()?.name;
}

describe('initDatabase', () => {
  let db: TypedDb;

  before(() => {
    db = initTypedDatabase(':memory:');
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

  it('uses ON UPDATE CASCADE for relationship foreign keys', () => {
    const fkRows = db
      .prepare<{
        from: string;
        table: string;
        on_update: string;
      }>("PRAGMA foreign_key_list('relationships')")
      .all();

    const edgeForeignKeys = fkRows.filter(
      (row) =>
        row.table === 'memories' &&
        (row.from === 'from_hash' || row.from === 'to_hash')
    );
    assert.equal(edgeForeignKeys.length, 2);
    for (const fk of edgeForeignKeys) {
      assert.equal(fk.on_update.toUpperCase(), 'CASCADE');
    }
  });

  it('can insert and retrieve a memory row', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('a'.repeat(64), 'test content', '["test"]', 'general', 0, now, now);

    const row = db
      .prepare<{ hash: string }>('SELECT hash FROM memories WHERE hash = ?')
      .get('a'.repeat(64));
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
      .get(h1);
    assert.equal(rel, undefined);
  });
});
