import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import { callTool } from './helpers.js';

interface RecallResult {
  ok: boolean;
  result: {
    memories: Array<{ hash: string; content: string }>;
    graph: Array<{ from_hash: string; to_hash: string; relation_type: string }>;
    depth_reached: number;
    aborted?: boolean;
    nextCursor?: string;
  };
}

interface StoreResult {
  ok: boolean;
  result: { hash: string; created: boolean };
}

describe('recall tool', () => {
  let server: McpServer;
  let db: TypedDb;
  let hashA: string;
  let hashB: string;

  before(async () => {
    db = initTypedDatabase(':memory:');
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
    assert.equal(data.result.aborted, undefined);
  });

  it('includes relationship edges in the result', async () => {
    const result = await callTool(server, 'recall', {
      query: 'machine learning',
      depth: 1,
    });
    const data = result.structuredContent as RecallResult;
    const edge = data.result.graph.find(
      (e) => e.from_hash === hashA && e.to_hash === hashB
    );
    assert.ok(edge !== undefined, 'Expected edge between hashA and hashB');
    assert.equal(edge.relation_type, 'related_to');
  });

  it('sets aborted when traversal exceeds edge budget', async () => {
    const insertMemory = db.prepare(
      `INSERT INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertRelationship = db.prepare(
      `INSERT INTO relationships (from_hash, to_hash, relation_type, created_at)
       VALUES (?, ?, ?, ?)`
    );

    const now = new Date().toISOString();
    const hubHash = `${'f'.repeat(63)}0`;
    insertMemory.run(
      hubHash,
      'hub-memory-overflow-target',
      '["hub"]',
      'general',
      0,
      now,
      now
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      for (let i = 1; i <= 5200; i++) {
        const leafHash = i.toString(16).padStart(64, '0');
        insertMemory.run(
          leafHash,
          `leaf-node-${i}`,
          '["leaf"]',
          'general',
          0,
          now,
          now
        );
        insertRelationship.run(hubHash, leafHash, 'related_to', now);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const result = await callTool(server, 'recall', {
      query: 'hub-memory-overflow-target',
      depth: 1,
      limit: 1,
    });
    const data = result.structuredContent as RecallResult;
    assert.equal(data.ok, true);
    assert.equal(data.result.aborted, true);
    assert.ok(data.result.graph.length > 0);
  });
});
