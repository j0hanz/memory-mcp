import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import { callTool, callToolWithProgress } from './helpers.js';

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
    // Insert test memories with varying importance but identical content to verify relevance ranking and token counting. Content is padded to ensure multiple tokens per memory for truncation testing.
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
      token_budget: 3000,
    });
    const data = result.structuredContent as RetrieveContextResult;
    // With budget 3000, estimated candidates = 3000/20 = 150 < 200 (MIN).
    // So limit is clamped to 200.
    // We inserted 205 rows, so we expect to hit the 200 row limit.
    assert.equal(data.truncated, true);
    assert.equal(data.memories.length, 200);
  });

  it('keeps scan/final totals aligned in progress updates', async () => {
    const outcome = await callToolWithProgress(server, 'retrieve_context', {
      query: 'context retrieval',
      token_budget: 100000,
    });
    assert.equal(outcome.error, undefined);

    const withTotals = outcome.notifications
      .map((notification) => notification.params)
      .filter((params) => params.total !== undefined);

    assert.ok(withTotals.length >= 2);
    const finalTotal = withTotals[withTotals.length - 1]?.total;
    for (const params of withTotals) {
      assert.equal(params.total, finalTotal);
    }

    const final = withTotals[withTotals.length - 1];
    assert.equal(final?.progress, final?.total);
  });

  it('emits completion progress when request is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    const outcome = await callToolWithProgress(
      server,
      'retrieve_context',
      { query: 'context retrieval' },
      { signal: controller.signal }
    );
    assert.equal(outcome.error, undefined);
    assert.ok((outcome.result as any).isError);
    assert.equal(
      (outcome.result as any).structuredContent.error.code,
      'E_CANCELLED'
    );
    assert.ok(outcome.notifications.length >= 2);

    const final =
      outcome.notifications[outcome.notifications.length - 1]?.params;
    assert.equal(final?.progress, final?.total);
  });
});
