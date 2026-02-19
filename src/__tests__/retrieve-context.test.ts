import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import { callTool } from './helpers.js';

interface RetrieveContextResult {
  memories: Array<{
    hash: string;
    content: string;
    memory_type: string;
    importance: number;
  }>;
  estimated_tokens: number;
  truncated: boolean;
}

describe('retrieve_context tool', () => {
  let server: McpServer;
  let db: TypedDb;

  before(() => {
    db = initTypedDatabase(':memory:');
    server = createServer(db);

    const now = new Date().toISOString();
    // Content is 210 chars each → ceil(210/4) = 53 tokens
    // With token_budget=100: first memory accepted (0+53=53<=100),
    // second memory truncates (53+53=106 > 100)
    const suffix = 'filler '.repeat(27) + 'end'; // 27×7 + 3 = 192 chars

    // High-importance memory relevant to 'context retrieval'
    db.prepare(
      `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'c'.repeat(63) + '1',
      `Context retrieval ${suffix}`,
      '["context","ai"]',
      'fact',
      9,
      now,
      now
    );

    // Low-importance memory relevant to 'context retrieval'
    db.prepare(
      `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'c'.repeat(63) + '2',
      `Context retrieval ${suffix}`,
      '["context","strategy"]',
      'general',
      1,
      now,
      now
    );

    // Third memory for truncation test
    db.prepare(
      `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'c'.repeat(63) + '3',
      `Context retrieval ${suffix}`,
      '["context","token"]',
      'general',
      5,
      now,
      now
    );
  });

  it('strategy relevance returns FTS-ranked results', async () => {
    const result = await callTool(server, 'retrieve_context', {
      query: 'context retrieval',
      strategy: 'relevance',
    });
    const data = result.structuredContent as RetrieveContextResult;
    assert.ok(data.memories.length > 0);
    assert.equal(typeof data.estimated_tokens, 'number');
    assert.ok(data.estimated_tokens > 0);
  });

  it('token_budget truncates results at correct boundary', async () => {
    // Each memory content is 210 chars = ceil(210/4) = 53 tokens.
    // token_budget=100: first memory fits (0+53=53<=100), second truncates (53+53=106>100).
    const result = await callTool(server, 'retrieve_context', {
      query: 'context retrieval',
      token_budget: 100,
    });
    const data = result.structuredContent as RetrieveContextResult;
    assert.equal(data.truncated, true);
    assert.ok(
      data.estimated_tokens <= 100,
      `Expected estimated_tokens <= 100, got ${data.estimated_tokens}`
    );
  });

  it('strategy importance returns highest-importance memory first', async () => {
    const result = await callTool(server, 'retrieve_context', {
      query: 'context retrieval',
      strategy: 'importance',
    });
    const data = result.structuredContent as RetrieveContextResult;
    assert.ok(data.memories.length > 0);

    // Verify descending importance order
    const importances = data.memories.map((m) => m.importance);
    for (let i = 1; i < importances.length; i++) {
      assert.ok(
        importances[i - 1]! >= importances[i]!,
        `Expected descending importance: ${importances[i - 1]} < ${importances[i]} at index ${i}`
      );
    }
  });

  it('marks truncated when row cap is exceeded', async () => {
    const now = new Date().toISOString();
    const insertMemory = db.prepare(
      `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (let i = 1; i <= 205; i++) {
      const hash = (i + 1000).toString(16).padStart(64, '0');
      insertMemory.run(
        hash,
        `row-cap-marker item ${i}`,
        '["cap","marker"]',
        'general',
        1,
        now,
        now
      );
    }

    const result = await callTool(server, 'retrieve_context', {
      query: 'row cap marker',
      token_budget: 200000,
    });
    const data = result.structuredContent as RetrieveContextResult;
    assert.equal(data.truncated, true);
    assert.equal(data.memories.length, 200);
  });
});
