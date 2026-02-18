import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { DatabaseSync } from 'node:sqlite';

import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import {
  registerCreateRelationship,
  registerDeleteMemories,
  registerDeleteMemory,
  registerDeleteRelationship,
  registerGetMemory,
  registerGetRelationships,
  registerMemoryStats,
  registerRecall,
  registerSearchMemories,
  registerStoreMemories,
  registerStoreMemory,
  registerUpdateMemory,
} from './tools/index.js';

export function createServer(db: DatabaseSync): McpServer {
  const server = new McpServer(
    {
      name: '@j0hanz/memory-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {},
        completions: {},
        resources: { subscribe: true },
        prompts: {},
        tools: {},
      },
    }
  );

  registerStoreMemory(server, db);
  registerGetMemory(server, db);
  registerUpdateMemory(server, db);
  registerDeleteMemory(server, db);
  registerMemoryStats(server, db);
  registerStoreMemories(server, db);
  registerDeleteMemories(server, db);
  registerSearchMemories(server, db);
  registerCreateRelationship(server, db);
  registerDeleteRelationship(server, db);
  registerGetRelationships(server, db);
  registerRecall(server, db);

  registerAllResources(server, db);
  registerAllPrompts(server);

  return server;
}
