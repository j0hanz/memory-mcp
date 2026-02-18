import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { before, describe, it } from 'node:test';

import { initDatabase } from '../db/index.js';
import { createServer } from '../server.js';
import { callTool } from './helpers.js';

interface StoreResult {
  ok: boolean;
  result: { hash: string; created: boolean };
}

describe('store_memory tool', () => {
  let db: DatabaseSync;
  let server: McpServer;

  before(() => {
    db = initDatabase(':memory:');
    server = createServer(db);
  });

  it('stores a new memory and returns created:true', async () => {
    const result = await callTool(server, 'store_memory', {
      content: 'test memory content',
      tags: ['test', 'unit'],
    });
    const data = result.structuredContent as StoreResult;
    assert.equal(data.ok, true);
    assert.equal(data.result.created, true);
    assert.match(data.result.hash, /^[a-f0-9]{64}$/);
  });

  it('is idempotent — same input returns created:false', async () => {
    const r1 = (await callTool(server, 'store_memory', {
      content: 'idempotent test',
      tags: ['idem'],
    })) as { structuredContent: StoreResult };
    const r2 = (await callTool(server, 'store_memory', {
      content: 'idempotent test',
      tags: ['idem'],
    })) as { structuredContent: StoreResult };
    assert.equal(
      r1.structuredContent.result.hash,
      r2.structuredContent.result.hash
    );
    assert.equal(r2.structuredContent.result.created, false);
  });

  it('captures memory_type and importance', async () => {
    const result = (await callTool(server, 'store_memory', {
      content: 'typed memory',
      tags: ['typed'],
      memory_type: 'fact',
      importance: 7,
    })) as { structuredContent: StoreResult };
    const hash = result.structuredContent.result.hash;
    const row = db
      .prepare('SELECT memory_type, importance FROM memories WHERE hash = ?')
      .get(hash) as { memory_type: string; importance: number } | undefined;
    assert.equal(row?.memory_type, 'fact');
    assert.equal(row?.importance, 7);
  });
});
