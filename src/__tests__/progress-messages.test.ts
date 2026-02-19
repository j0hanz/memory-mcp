import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import { callTool, callToolWithProgress } from './helpers.js';

interface StoreResult {
  hash: string;
}

describe('progress message formatting', () => {
  let server: McpServer;
  let db: TypedDb;
  let fromHash: string;
  let toHash: string;

  before(async () => {
    db = initTypedDatabase(':memory:');
    server = createServer(db);

    const source = (await callTool(server, 'store_memory', {
      content: 'source-memory-progress-format',
      tags: ['progress', 'source'],
    })) as { structuredContent: StoreResult };
    fromHash = source.structuredContent.hash;

    const target = (await callTool(server, 'store_memory', {
      content: 'target-memory-progress-format',
      tags: ['progress', 'target'],
    })) as { structuredContent: StoreResult };
    toHash = target.structuredContent.hash;
  });

  it('create_relationship start message avoids completion separator', async () => {
    const outcome = await callToolWithProgress(server, 'create_relationship', {
      from_hash: fromHash,
      to_hash: toHash,
      relation_type: 'related_to',
    });
    assert.equal(outcome.error, undefined);
    assert.ok(outcome.notifications.length >= 2);

    const startMessage = outcome.notifications[0]?.params.message ?? '';
    const finalMessage =
      outcome.notifications[outcome.notifications.length - 1]?.params.message ??
      '';

    assert.equal(startMessage.includes(' • '), false);
    assert.match(finalMessage, / • completed$/);
  });

  it('delete_relationship start message avoids completion separator', async () => {
    await callTool(server, 'create_relationship', {
      from_hash: fromHash,
      to_hash: toHash,
      relation_type: 'related_to',
    });

    const outcome = await callToolWithProgress(server, 'delete_relationship', {
      from_hash: fromHash,
      to_hash: toHash,
      relation_type: 'related_to',
    });
    assert.equal(outcome.error, undefined);
    assert.ok(outcome.notifications.length >= 2);

    const startMessage = outcome.notifications[0]?.params.message ?? '';
    const finalMessage =
      outcome.notifications[outcome.notifications.length - 1]?.params.message ??
      '';

    assert.equal(startMessage.includes(' • '), false);
    assert.match(finalMessage, / • completed$/);
  });
});
