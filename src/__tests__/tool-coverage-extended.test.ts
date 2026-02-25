import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import { callTool } from './helpers.js';

interface StoreResult {
  hash: string;
  created: boolean;
}

interface ErrorPayload {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

function parseErrorPayload(result: {
  content?: Array<{ type: string; text?: string }>;
}): ErrorPayload {
  const text = result.content?.[0]?.text;
  if (!text) {
    throw new Error('Expected text error payload');
  }
  return JSON.parse(text) as ErrorPayload;
}

describe('extended tool coverage', () => {
  let db: TypedDb;
  let server: McpServer;

  before(() => {
    db = initTypedDatabase(':memory:');
    server = createServer(db);
  });

  it('get_memory returns stored memory and returns E_NOT_FOUND for missing hash', async () => {
    const stored = (await callTool(server, 'store_memory', {
      content: 'lookup memory',
      tags: ['lookup'],
      memory_type: 'fact',
      importance: 6,
    })) as { structuredContent: StoreResult };

    const found = (await callTool(server, 'get_memory', {
      hash: stored.structuredContent.hash,
    })) as {
      structuredContent: {
        hash: string;
        content: string;
        tags: string[];
        memory_type: string;
      };
    };

    assert.equal(found.structuredContent.hash, stored.structuredContent.hash);
    assert.equal(found.structuredContent.content, 'lookup memory');
    assert.deepEqual(found.structuredContent.tags, ['lookup']);
    assert.equal(found.structuredContent.memory_type, 'fact');

    const missing = (await callTool(server, 'get_memory', {
      hash: '0'.repeat(64),
    })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };

    assert.equal(missing.isError, true);
    assert.equal(parseErrorPayload(missing).error.code, 'E_NOT_FOUND');
  });

  it('store_memories supports batch create and idempotent re-store', async () => {
    const first = (await callTool(server, 'store_memories', {
      items: [
        { content: 'batch one', tags: ['batch', 'one'], memory_type: 'plan' },
        { content: 'batch two', tags: ['batch', 'two'], importance: 8 },
      ],
    })) as {
      structuredContent: {
        items: Array<{ hash: string; created?: boolean; ok: boolean }>;
        succeeded: number;
        failed: number;
      };
    };

    assert.equal(first.structuredContent.succeeded, 2);
    assert.equal(first.structuredContent.failed, 0);
    assert.equal(
      first.structuredContent.items.filter((item) => item.created === true)
        .length,
      2
    );

    const second = (await callTool(server, 'store_memories', {
      items: [
        { content: 'batch one', tags: ['batch', 'one'], memory_type: 'plan' },
        { content: 'batch two', tags: ['batch', 'two'], importance: 8 },
      ],
    })) as {
      structuredContent: {
        items: Array<{ hash: string; created?: boolean; ok: boolean }>;
      };
    };

    assert.equal(
      second.structuredContent.items.filter((item) => item.created === false)
        .length,
      2
    );
  });

  it('delete_memory and delete_memories return expected item-level deletion flags', async () => {
    const single = (await callTool(server, 'store_memory', {
      content: 'to delete single',
      tags: ['delete', 'single'],
    })) as { structuredContent: StoreResult };

    const singleDelete = (await callTool(server, 'delete_memory', {
      hash: single.structuredContent.hash,
    })) as { structuredContent: { hash: string; deleted: boolean } };

    assert.equal(
      singleDelete.structuredContent.hash,
      single.structuredContent.hash
    );
    assert.equal(singleDelete.structuredContent.deleted, true);

    const b1 = (await callTool(server, 'store_memory', {
      content: 'batch delete 1',
      tags: ['delete', 'batch1'],
    })) as { structuredContent: StoreResult };
    const b2 = (await callTool(server, 'store_memory', {
      content: 'batch delete 2',
      tags: ['delete', 'batch2'],
    })) as { structuredContent: StoreResult };

    const batchDelete = (await callTool(server, 'delete_memories', {
      hashes: [
        b1.structuredContent.hash,
        b2.structuredContent.hash,
        'f'.repeat(64),
      ],
    })) as {
      structuredContent: {
        items: Array<{ hash: string; deleted?: boolean; ok: boolean }>;
        succeeded: number;
        failed: number;
      };
    };

    assert.equal(batchDelete.structuredContent.succeeded, 3);
    assert.equal(batchDelete.structuredContent.failed, 0);
    const missing = batchDelete.structuredContent.items.find(
      (item) => item.hash === 'f'.repeat(64)
    );
    assert.equal(missing?.deleted, false);
  });

  it('delete_memory returns deleted:false (not an error) when hash does not exist', async () => {
    const nonExistentHash = 'a'.repeat(64);
    const result = (await callTool(server, 'delete_memory', {
      hash: nonExistentHash,
    })) as {
      isError?: boolean;
      structuredContent: { hash: string; deleted: boolean };
    };

    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.hash, nonExistentHash);
    assert.equal(result.structuredContent.deleted, false);
  });

  it('get_relationships returns linked memories and memory_stats reflects totals', async () => {
    const source = (await callTool(server, 'store_memory', {
      content: 'relationship source',
      tags: ['rel', 'source'],
      memory_type: 'fact',
      importance: 9,
    })) as { structuredContent: StoreResult };
    const target = (await callTool(server, 'store_memory', {
      content: 'relationship target',
      tags: ['rel', 'target'],
      memory_type: 'lesson',
      importance: 3,
    })) as { structuredContent: StoreResult };

    await callTool(server, 'create_relationship', {
      from_hash: source.structuredContent.hash,
      to_hash: target.structuredContent.hash,
      relation_type: 'supports',
    });

    const rel = (await callTool(server, 'get_relationships', {
      hash: source.structuredContent.hash,
      direction: 'outgoing',
    })) as {
      structuredContent: {
        count: number;
        relationships: Array<{ linked_hash: string; linked_content: string }>;
      };
    };

    assert.equal(rel.structuredContent.count, 1);
    assert.equal(
      rel.structuredContent.relationships[0]?.linked_hash,
      target.structuredContent.hash
    );
    assert.equal(
      rel.structuredContent.relationships[0]?.linked_content,
      'relationship target'
    );

    const stats = (await callTool(server, 'memory_stats', {})) as {
      structuredContent: {
        memories: { total: number; newest: string | null };
        relationships: { total: number };
        by_type: Record<string, number>;
      };
    };

    assert.ok(stats.structuredContent.memories.total >= 2);
    assert.equal(stats.structuredContent.relationships.total >= 1, true);
    assert.equal((stats.structuredContent.by_type['fact'] ?? 0) >= 1, true);
    assert.equal(stats.structuredContent.memories.newest !== null, true);
  });

  it('get_relationships direction=both does not duplicate self-loop edges', async () => {
    const stored = (await callTool(server, 'store_memory', {
      content: 'self loop coverage case',
      tags: ['self-loop', 'coverage'],
    })) as { structuredContent: StoreResult };

    await callTool(server, 'create_relationship', {
      from_hash: stored.structuredContent.hash,
      to_hash: stored.structuredContent.hash,
      relation_type: 'related_to',
    });

    const both = (await callTool(server, 'get_relationships', {
      hash: stored.structuredContent.hash,
      direction: 'both',
    })) as {
      structuredContent: {
        count: number;
        relationships: Array<{ from_hash: string; to_hash: string }>;
      };
    };

    assert.equal(both.structuredContent.count, 1);
    assert.equal(both.structuredContent.relationships.length, 1);
    assert.equal(
      both.structuredContent.relationships[0]?.from_hash,
      stored.structuredContent.hash
    );
    assert.equal(
      both.structuredContent.relationships[0]?.to_hash,
      stored.structuredContent.hash
    );
  });
});
