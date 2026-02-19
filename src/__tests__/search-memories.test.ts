import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import { callTool } from './helpers.js';

interface SearchResult {
  memories: Array<{
    hash: string;
    content: string;
    tags: string[];
    memory_type: string;
    importance: number;
    relevance?: number;
  }>;
  total_returned: number;
  nextCursor?: string;
}

describe('search_memories tool', () => {
  let server: McpServer;
  let db: TypedDb;

  before(async () => {
    db = initTypedDatabase(':memory:');
    server = createServer(db);

    // Seed some memories
    const seeds = [
      {
        content: 'TypeScript is a typed superset of JavaScript',
        tags: ['typescript', 'programming'],
      },
      {
        content: 'React is a UI library for building user interfaces',
        tags: ['react', 'ui'],
      },
      {
        content: 'Node.js is a JavaScript runtime environment',
        tags: ['nodejs', 'javascript'],
      },
    ];
    for (const seed of seeds) {
      await callTool(server, 'store_memory', seed);
    }
  });

  it('finds memories matching a query', async () => {
    const result = await callTool(server, 'search_memories', {
      query: 'TypeScript',
    });
    const data = result.structuredContent as SearchResult;
    assert.ok(data.memories.length > 0);
    assert.ok(data.memories.some((m) => m.content.includes('TypeScript')));
  });

  it('returns empty for no matches', async () => {
    const result = await callTool(server, 'search_memories', {
      query: 'QuantumComputingXYZ',
    });
    const data = result.structuredContent as SearchResult;
    assert.equal(data.memories.length, 0);
    assert.equal(data.total_returned, 0);
  });

  it('respects the limit parameter', async () => {
    // Seed more memories to test limit
    const now = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `${'d'.repeat(63)}${i}`,
        `Extra test content for limit test number ${i}`,
        '["limit","test"]',
        'general',
        0,
        now,
        now
      );
    }

    const result = await callTool(server, 'search_memories', {
      query: 'limit test',
      limit: 2,
    });
    const data = result.structuredContent as SearchResult;
    assert.ok(data.memories.length <= 2);
  });

  it('includes positive relevance scores', async () => {
    const result = await callTool(server, 'search_memories', {
      query: 'TypeScript',
    });
    const data = result.structuredContent as SearchResult;
    assert.ok(data.memories.length > 0);
    for (const mem of data.memories) {
      assert.equal(typeof mem.relevance, 'number');
      assert.ok(
        mem.relevance! > 0,
        `Expected positive relevance, got ${mem.relevance}`
      );
    }
  });

  it('uses opaque keyset cursor for stable pagination', async () => {
    const firstPage = await callTool(server, 'search_memories', {
      query: 'limit test',
      limit: 1,
    });
    const first = firstPage.structuredContent as SearchResult;
    assert.equal(first.memories.length, 1);
    assert.ok(first.nextCursor, 'Expected nextCursor on first page');

    const secondPage = await callTool(server, 'search_memories', {
      query: 'limit test',
      limit: 1,
      cursor: first.nextCursor,
    });
    const second = secondPage.structuredContent as SearchResult;
    assert.equal(second.memories.length, 1);
    assert.notEqual(second.memories[0]?.hash, first.memories[0]?.hash);
  });

  it('rejects cursor reuse across a different query', async () => {
    const firstPage = await callTool(server, 'search_memories', {
      query: 'limit test',
      limit: 1,
    });
    const first = firstPage.structuredContent as SearchResult;
    assert.ok(first.nextCursor);

    await assert.rejects(
      () =>
        callTool(server, 'search_memories', {
          query: 'TypeScript',
          limit: 1,
          cursor: first.nextCursor,
        }),
      /E_INVALID_CURSOR/
    );
  });

  describe('with filters', () => {
    before(() => {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'a'.repeat(63) + '1',
        'Fact about sorting algorithms and data structures',
        '["algorithms","fact"]',
        'fact',
        8,
        now,
        now
      );
      db.prepare(
        `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'a'.repeat(63) + '2',
        'General note about sorting algorithms and complexity',
        '["algorithms","general"]',
        'general',
        2,
        now,
        now
      );
    });

    it('filter by memory_type returns only matching type', async () => {
      const result = await callTool(server, 'search_memories', {
        query: 'algorithms',
        memory_type: 'fact',
      });
      const data = result.structuredContent as SearchResult;
      assert.ok(data.memories.length > 0);
      for (const mem of data.memories) {
        assert.equal(
          mem.memory_type,
          'fact',
          `Expected memory_type 'fact', got '${mem.memory_type}'`
        );
      }
    });

    it('min_importance: 5 excludes low-importance memories', async () => {
      const result = await callTool(server, 'search_memories', {
        query: 'algorithms',
        min_importance: 5,
      });
      const data = result.structuredContent as SearchResult;
      for (const mem of data.memories) {
        assert.ok(
          mem.importance >= 5,
          `Expected importance >= 5, got ${mem.importance}`
        );
      }
    });

    it('no filters returns results (original behavior unchanged)', async () => {
      const result = await callTool(server, 'search_memories', {
        query: 'TypeScript',
      });
      const data = result.structuredContent as SearchResult;
      assert.ok(data.memories.length > 0);
    });
  });
});
