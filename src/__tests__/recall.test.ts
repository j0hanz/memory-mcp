import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { before, describe, it } from 'node:test';

import { initDatabase } from '../db/index.js';
import { createServer } from '../server.js';

interface RecallResult {
  ok: boolean;
  result: {
    memories: Array<{ hash: string; content: string }>;
    edges: Array<{ from_hash: string; to_hash: string; relation_type: string }>;
    total: number;
    nextCursor: string | null;
  };
}

interface StoreResult {
  ok: boolean;
  result: { hash: string; created: boolean };
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

describe('recall tool', () => {
  let server: McpServer;
  let hashA: string;
  let hashB: string;

  before(async () => {
    const db: DatabaseSync = initDatabase(':memory:');
    server = createServer(db);

    // Store two memories and link them
    const r1 = (await callTool(server, 'store_memory', {
      content: 'Memory about machine learning algorithms',
      tags: ['ml', 'algorithms'],
    })) as { structuredContent: StoreResult };
    hashA = r1.structuredContent.result.hash;

    const r2 = (await callTool(server, 'store_memory', {
      content: 'Memory about neural network architectures',
      tags: ['neural', 'deeplearning'],
    })) as { structuredContent: StoreResult };
    hashB = r2.structuredContent.result.hash;

    await callTool(server, 'create_relationship', {
      from_hash: hashA,
      to_hash: hashB,
      relation_type: 'related_to',
    });
  });

  it('returns seed memories matching the query', async () => {
    const result = await callTool(server, 'recall', {
      query: 'machine learning',
      depth: 0,
    });
    const data = result.structuredContent as RecallResult;
    assert.equal(data.ok, true);
    assert.ok(data.result.memories.some((m) => m.hash === hashA));
  });

  it('traverses relationships at depth 1', async () => {
    const result = await callTool(server, 'recall', {
      query: 'machine learning',
      depth: 1,
    });
    const data = result.structuredContent as RecallResult;
    const hashes = data.result.memories.map((m) => m.hash);
    assert.ok(hashes.includes(hashA));
    assert.ok(hashes.includes(hashB));
  });

  it('includes relationship edges in the result', async () => {
    const result = await callTool(server, 'recall', {
      query: 'machine learning',
      depth: 1,
    });
    const data = result.structuredContent as RecallResult;
    const edge = data.result.edges.find(
      (e) => e.from_hash === hashA && e.to_hash === hashB
    );
    assert.ok(edge !== undefined, 'Expected edge between hashA and hashB');
    assert.equal(edge.relation_type, 'related_to');
  });
});
