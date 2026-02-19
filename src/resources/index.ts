import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';

import { createHashCompletionCallback } from '../completions/index.js';
import type { TypedDb } from '../db/typed.js';
import { loadInstructions } from '../lib/instructions.js';
import { parseMemoryRow } from '../lib/types.js';
import type { MemoryRow } from '../lib/types.js';

const HASH_REGEX = /^[a-f0-9]{64}$/;
const INSTRUCTIONS_URI = 'internal://instructions';
const MEMORY_RESOURCE_URI_TEMPLATE = 'memory://memories/{hash}';

interface JsonResourceContent {
  uri: string;
  mimeType: 'application/json';
  text: string;
}

function createJsonContent(uri: string, payload: unknown): JsonResourceContent {
  return {
    uri,
    mimeType: 'application/json',
    text: JSON.stringify(payload),
  };
}

function createErrorResourceContents(
  uri: string,
  error: string,
  hash?: string
): { contents: JsonResourceContent[] } {
  return {
    contents: [createJsonContent(uri, { error, ...(hash ? { hash } : {}) })],
  };
}

function getSingleVariable(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readMemoryByHash(db: TypedDb, hash: string): MemoryRow | undefined {
  return db
    .prepareOnce<MemoryRow>('SELECT * FROM memories WHERE hash = ?')
    .get(hash);
}

const INSTRUCTIONS_CONTENT = loadInstructions();

export function registerAllResources(server: McpServer, db: TypedDb): void {
  server.registerResource(
    'instructions',
    INSTRUCTIONS_URI,
    {
      title: 'Memory Instructions',
      description: 'Usage guide for all memory tools and workflows.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.9 },
    },
    () => ({
      contents: [
        {
          uri: INSTRUCTIONS_URI,
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_CONTENT,
        },
      ],
    })
  );

  const hashCompletion = createHashCompletionCallback(db);

  server.registerResource(
    'memory',
    new ResourceTemplate(MEMORY_RESOURCE_URI_TEMPLATE, {
      list: undefined,
      complete: { hash: hashCompletion },
    }),
    {
      title: 'Memory',
      description: 'Retrieve a memory by its SHA-256 hash.',
      mimeType: 'application/json',
      annotations: { audience: ['assistant'], priority: 0.7 },
    },
    (uri: URL, variables: Variables) => {
      const rawHash = variables['hash'];
      const hash = getSingleVariable(rawHash);

      if (!hash || !HASH_REGEX.test(hash)) {
        return createErrorResourceContents(uri.href, 'Invalid hash');
      }

      const row = readMemoryByHash(db, hash);

      if (!row) {
        return createErrorResourceContents(uri.href, 'Not found', hash);
      }

      return {
        contents: [createJsonContent(uri.href, parseMemoryRow(row))],
      };
    }
  );
}
