import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHashCompletionCallback } from '../completions/index.js';
import type { TypedDb } from '../db/typed.js';
import { parseMemoryRow } from '../lib/types.js';
import type { MemoryRow } from '../lib/types.js';

const baseDir = fileURLToPath(new URL('.', import.meta.url));
const FALLBACK_INSTRUCTIONS =
  '# Memory instructions\n\nSee the README for usage details.';

function loadInstructions(): string {
  const paths = [
    join(baseDir, 'instructions.md'),
    join(baseDir, '..', 'instructions.md'),
    join(baseDir, '..', '..', 'src', 'instructions.md'),
  ];
  for (const p of paths) {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      // try next path
    }
  }
  return FALLBACK_INSTRUCTIONS;
}

function createJsonContent(
  uri: string,
  payload: unknown
): { uri: string; mimeType: 'application/json'; text: string } {
  return {
    uri,
    mimeType: 'application/json',
    text: JSON.stringify(payload),
  };
}

function readMemoryByHash(db: TypedDb, hash: string): MemoryRow | undefined {
  return db
    .prepare<MemoryRow>('SELECT * FROM memories WHERE hash = ?')
    .get(hash);
}

const INSTRUCTIONS_CONTENT = loadInstructions();

export function registerAllResources(server: McpServer, db: TypedDb): void {
  server.registerResource(
    'instructions',
    'internal://instructions',
    {
      title: 'Memory Instructions',
      description: 'Usage guide for all memory tools and workflows.',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: 'internal://instructions',
          mimeType: 'text/markdown',
          text: INSTRUCTIONS_CONTENT,
        },
      ],
    })
  );

  const hashCompletion = createHashCompletionCallback(db);

  server.registerResource(
    'memory',
    new ResourceTemplate('memory://memories/{hash}', {
      list: undefined,
      complete: { hash: hashCompletion },
    }),
    {
      title: 'Memory',
      description: 'Retrieve a memory by its SHA-256 hash.',
      mimeType: 'application/json',
    },
    (uri: URL, variables: Variables) => {
      const rawHash = variables['hash'];
      const hash = Array.isArray(rawHash) ? rawHash[0] : rawHash;

      if (!hash) {
        return {
          contents: [createJsonContent(uri.href, { error: 'Missing hash' })],
        };
      }

      const row = readMemoryByHash(db, hash);

      if (!row) {
        return {
          contents: [createJsonContent(uri.href, { error: 'Not found', hash })],
        };
      }

      return {
        contents: [createJsonContent(uri.href, parseMemoryRow(row))],
      };
    }
  );
}
