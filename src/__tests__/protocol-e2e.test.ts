import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { initTypedDatabase } from '../db/index.js';
import type { TypedDb } from '../db/typed.js';
import { createServer } from '../server.js';

describe('protocol e2e', () => {
  let db: TypedDb;
  let server: McpServer;
  let client: Client;

  before(async () => {
    db = initTypedDatabase(':memory:');
    server = createServer(db);
    client = new Client(
      { name: 'memory-mcp-test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  after(async () => {
    await Promise.allSettled([client.close(), server.close()]);
    db.close();
  });

  it('lists tools/resources/prompts through MCP transport', async () => {
    const tools = await client.listTools();
    const resources = await client.listResources();
    const prompts = await client.listPrompts();

    assert.ok(tools.tools.some((tool) => tool.name === 'store_memory'));
    assert.ok(
      resources.resources.some(
        (resource) => resource.uri === 'internal://instructions'
      )
    );
    assert.ok(prompts.prompts.some((prompt) => prompt.name === 'get-help'));
  });

  it('reads instructions resource through MCP transport', async () => {
    const result = await client.readResource({
      uri: 'internal://instructions',
    });
    assert.equal(result.contents[0]?.mimeType, 'text/markdown');
    assert.match(result.contents[0]?.text ?? '', /MEMORY-MCP INSTRUCTIONS/);
  });

  it('surfaces invalid cursor errors over protocol calls', async () => {
    await client.callTool({
      name: 'store_memory',
      arguments: {
        content: 'e2e cursor item one',
        tags: ['e2e', 'cursor'],
      },
    });
    await client.callTool({
      name: 'store_memory',
      arguments: {
        content: 'e2e cursor item two',
        tags: ['e2e', 'cursor'],
      },
    });

    const firstPage = await client.callTool({
      name: 'search_memories',
      arguments: {
        query: 'e2e cursor item',
        limit: 1,
      },
    });
    const payload = firstPage.structuredContent as {
      memories: Array<{ hash: string }>;
      nextCursor?: string;
    };
    assert.equal(payload.memories.length, 1);
    assert.ok(payload.nextCursor);

    const response = await client.callTool({
      name: 'search_memories',
      arguments: {
        query: 'different query text',
        limit: 1,
        cursor: payload.nextCursor,
      },
    });
    assert.equal(response.isError, true);
    assert.match(JSON.stringify(response.content), /E_INVALID_CURSOR/);
  });

  it('handles progress-enabled call paths over MCP transport', async () => {
    const result = (await client.callTool({
      name: 'memory_stats',
      arguments: {},
    })) as CallToolResult;
    assert.equal(result.isError, undefined);
    assert.ok(result.structuredContent);
  });
});
