import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { before, describe, it } from 'node:test';

import { initDatabase } from '../db/index.js';
import { createServer } from '../server.js';

interface SearchResult {
  ok: boolean;
  result: {
    memories: Array<{ hash: string; content: string; tags: string[] }>;
    total: number;
    nextCursor: string | null;
  };
}

function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ structuredContent: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools as Record<
    string,
    {
      inputSchema?: { parse(v: unknown): unknown };
      handler: (args: unknown, extra: unknown) => Promise<unknown>;
    }
  >;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
  return tool.handler(parsed, {}) as Promise<{ structuredContent: unknown }>;
}

describe('search_memories tool', () => {
  let server: McpServer;
  let db: DatabaseSync;

  before(async () => {
    db = initDatabase(':memory:');
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
    assert.equal(data.ok, true);
    assert.ok(data.result.memories.length > 0);
    assert.ok(
      data.result.memories.some((m) => m.content.includes('TypeScript'))
    );
  });

  it('returns empty for no matches', async () => {
    const result = await callTool(server, 'search_memories', {
      query: 'QuantumComputingXYZ',
    });
    const data = result.structuredContent as SearchResult;
    assert.equal(data.result.memories.length, 0);
    assert.equal(data.result.total, 0);
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
    assert.ok(data.result.memories.length <= 2);
  });
});
