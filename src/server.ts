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

type RegisterToolFn = (server: McpServer, db: DatabaseSync) => void;

const REGISTER_TOOL_FNS: RegisterToolFn[] = [
  registerStoreMemory,
  registerGetMemory,
  registerUpdateMemory,
  registerDeleteMemory,
  registerMemoryStats,
  registerStoreMemories,
  registerDeleteMemories,
  registerSearchMemories,
  registerCreateRelationship,
  registerDeleteRelationship,
  registerGetRelationships,
  registerRecall,
];

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

  for (const registerTool of REGISTER_TOOL_FNS) {
    registerTool(server, db);
  }

  registerAllResources(server, db);
  registerAllPrompts(server);

  return server;
}
