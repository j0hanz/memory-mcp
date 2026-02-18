import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { fileURLToPath } from 'node:url';

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

const ICON_ASSET = 'logo.svg';
const ICON_MIME = 'image/svg+xml';
const ICON_SIZES = ['any'];
const MAX_ICON_BYTES = 2 * 1024 * 1024;

function loadPackageVersion(): string {
  const pkgPath = findPackageJSON('.', import.meta.url);
  if (!pkgPath) throw new Error('Could not find package.json');
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    version: string;
  };
  return version;
}

function getLocalIconData(): string | undefined {
  const candidates = [
    new URL(`../assets/${ICON_ASSET}`, import.meta.url),
    new URL(`./assets/${ICON_ASSET}`, import.meta.url),
  ];

  for (const candidate of candidates) {
    try {
      const filePath = fileURLToPath(candidate);
      const buf = readFileSync(filePath);

      if (buf.byteLength >= MAX_ICON_BYTES) {
        console.warn(
          `Icon asset exceeds 2 MB (${buf.byteLength} bytes), skipping.`
        );
        return undefined;
      }

      return `data:${ICON_MIME};base64,${buf.toString('base64')}`;
    } catch {
      // try next candidate
    }
  }

  return undefined;
}

export function createServer(db: TypedDb): McpServer {
  const localIcon = getLocalIconData();
  const server = new McpServer(
    {
      name: 'memory-mcp',
      version: loadPackageVersion(),
      ...(localIcon
        ? {
            icons: [{ src: localIcon, mimeType: ICON_MIME, sizes: ICON_SIZES }],
          }
        : {}),
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
