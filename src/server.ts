import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { TypedDb } from './db/typed.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllTools } from './tools/index.js';

const ICON_ASSET = 'logo.svg';
const ICON_MIME = 'image/svg+xml';
const ICON_SIZES = ['any'];
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const SERVER_NAME = 'memory-mcp';
const SERVER_CAPABILITIES = {
  logging: {},
  completions: {},
  resources: { subscribe: true },
  prompts: {},
  tools: {},
} as const;

interface PackageManifest {
  version: string;
}

interface IconDescriptor {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: 'light' | 'dark';
}

function parsePackageManifest(contents: string): PackageManifest {
  return JSON.parse(contents) as PackageManifest;
}

function loadPackageManifest(): PackageManifest {
  const pkgPath = findPackageJSON('.', import.meta.url);
  if (!pkgPath) {
    throw new Error('Could not find package.json');
  }

  return parsePackageManifest(readFileSync(pkgPath, 'utf-8'));
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

function createIconDescriptors(): IconDescriptor[] | undefined {
  const src = getLocalIconData();
  if (!src) return undefined;
  return [{ src, mimeType: ICON_MIME, sizes: ICON_SIZES }];
}

export function createServer(db: TypedDb): McpServer {
  const { version } = loadPackageManifest();
  const icons = createIconDescriptors();
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version,
      ...(icons ? { icons } : {}),
    },
    {
      capabilities: SERVER_CAPABILITIES,
    }
  );

  registerAllTools(server, db);
  registerAllResources(server, db);
  registerAllPrompts(server);

  return server;
}
