import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import { callTool } from './helpers.js';

interface StoreResult {
  hash: string;
}

interface UpdateResult {
  old_hash: string;
  new_hash: string;
}

interface ErrorResult {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

describe('update_memory tool', () => {
  let server: McpServer;
  let db: TypedDb;

  before(() => {
    db = initTypedDatabase(':memory:');
    server = createServer(db);
  });

  it('updates linked memory hash and preserves relationships via FK update cascade', async () => {
    const source = (await callTool(server, 'store_memory', {
      content: 'Original source memory',
      tags: ['source'],
    })) as { structuredContent: StoreResult };
    const target = (await callTool(server, 'store_memory', {
      content: 'Target memory',
      tags: ['target'],
    })) as { structuredContent: StoreResult };

    await callTool(server, 'create_relationship', {
      from_hash: source.structuredContent.hash,
      to_hash: target.structuredContent.hash,
      relation_type: 'related_to',
    });

    const updated = (await callTool(server, 'update_memory', {
      hash: source.structuredContent.hash,
      content: 'Updated source memory',
      tags: ['source', 'updated'],
    })) as { structuredContent: UpdateResult };

    assert.notEqual(
      updated.structuredContent.new_hash,
      updated.structuredContent.old_hash
    );

    const rel = db
      .prepare<{ from_hash: string; to_hash: string }>(
        `SELECT from_hash, to_hash
         FROM relationships
         WHERE from_hash = ? AND to_hash = ?`
      )
      .get(updated.structuredContent.new_hash, target.structuredContent.hash);
    assert.ok(rel, 'Expected relationship to reference new source hash');
  });

  it('returns E_CONFLICT when updating to existing content+tags hash', async () => {
    const a = (await callTool(server, 'store_memory', {
      content: 'Conflict source A',
      tags: ['conflict', 'a'],
    })) as { structuredContent: StoreResult };
    const b = (await callTool(server, 'store_memory', {
      content: 'Conflict source B',
      tags: ['conflict', 'b'],
    })) as { structuredContent: StoreResult };

    const result = (await callTool(server, 'update_memory', {
      hash: a.structuredContent.hash,
      content: 'Conflict source B',
      tags: ['conflict', 'b'],
    })) as {
      isError?: boolean;
      content?: Array<{ type: string; text: string }>;
    };

    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content![0]!.text) as ErrorResult;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, 'E_CONFLICT');
    assert.match(parsed.error.message, new RegExp(b.structuredContent.hash));
  });
});
