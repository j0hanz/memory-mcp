import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';

import type { TypedDb } from './db/typed.js';
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

type RegisterToolFn = (server: McpServer, db: TypedDb) => void;

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

function loadPackageVersion(): string {
  const pkgPath = findPackageJSON('.', import.meta.url);
  if (!pkgPath) throw new Error('Could not find package.json');
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    version: string;
  };
  return version;
}

export function createServer(db: TypedDb): McpServer {
  const server = new McpServer(
    {
      name: 'memory-mcp',
      version: loadPackageVersion(),
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
