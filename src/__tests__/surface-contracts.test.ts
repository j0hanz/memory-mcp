import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createHashCompletionCallback } from '../completions/index.js';
import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';
import {
  callPrompt,
  callTool,
  getRegisteredToolsSnapshot,
  readStaticResource,
  readTemplateResource,
} from './helpers.js';

interface StoreResult {
  hash: string;
}

describe('resources, prompts, completions, and task-surface contracts', () => {
  let db: TypedDb;
  let server: McpServer;

  before(() => {
    db = initTypedDatabase(':memory:');
    server = createServer(db);
  });

  it('registered tools use SDK-managed task support on registerTool path', () => {
    const tools = getRegisteredToolsSnapshot(server);
    const names = Object.keys(tools);
    assert.ok(names.length > 0);

    for (const name of names) {
      const support = tools[name]?.execution?.taskSupport;
      assert.equal(
        support,
        'forbidden',
        `Expected ${name} to have SDK default taskSupport=forbidden`
      );
    }
  });

  it('does not advertise tasks capability when no task handlers are registered', () => {
    const capabilities =
      (server.server as unknown as { _capabilities?: { tasks?: unknown } })
        ._capabilities ?? {};

    assert.equal(capabilities.tasks, undefined);
  });

  it('static and template resources return expected payloads', async () => {
    const instructions = (await readStaticResource(
      server,
      'internal://instructions'
    )) as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };

    assert.equal(instructions.contents[0]?.uri, 'internal://instructions');
    assert.equal(instructions.contents[0]?.mimeType, 'text/markdown');
    assert.equal(instructions.contents[0]?.text.includes('Memory MCP'), true);

    const stored = (await callTool(server, 'store_memory', {
      content: 'resource template memory',
      tags: ['resource', 'template'],
    })) as { structuredContent: StoreResult };

    const memoryUri = `memory://memories/${stored.structuredContent.hash}`;
    const templated = (await readTemplateResource(
      server,
      'memory',
      new URL(memoryUri),
      { hash: stored.structuredContent.hash }
    )) as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };

    assert.equal(templated.contents[0]?.uri, memoryUri);
    assert.equal(templated.contents[0]?.mimeType, 'application/json');
    assert.equal(
      templated.contents[0]?.text.includes('resource template memory'),
      true
    );
  });

  it('get-help prompt returns user and assistant messages', async () => {
    const result = (await callPrompt(server, 'get-help')) as {
      messages: Array<{
        role: string;
        content: { type: string; text: string };
      }>;
    };

    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0]?.role, 'user');
    assert.equal(result.messages[1]?.role, 'assistant');
    assert.equal(result.messages[1]?.content.type, 'text');
    assert.equal(result.messages[1]?.content.text.includes('Memory MCP'), true);
  });

  it('hash completion callback escapes LIKE wildcards and returns matching prefixes', async () => {
    const first = (await callTool(server, 'store_memory', {
      content: 'completion sample one',
      tags: ['completion', 'one'],
    })) as { structuredContent: StoreResult };

    await callTool(server, 'store_memory', {
      content: 'completion sample two',
      tags: ['completion', 'two'],
    });

    const completeHash = createHashCompletionCallback(db);
    const prefix = first.structuredContent.hash.slice(0, 10);
    const matches = completeHash(prefix);

    assert.equal(
      matches.some((hash) => hash === first.structuredContent.hash),
      true
    );

    const escaped = completeHash('%_\\');
    assert.deepEqual(escaped, []);
  });
});
