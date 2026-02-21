import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_UNKNOWN, getErrorMessage, rethrowMcpError } from '../lib/errors.js';
import { computeMemoryHash } from '../lib/hash.js';
import { logToolEvent, notifyMemoryResourceUpdated } from '../lib/mcp-utils.js';
import { INSERT_MEMORY_SQL } from '../lib/sql.js';
import { getToolContract } from '../lib/tool-contracts.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { type StoreMemoryInputSchema } from '../schemas/inputs.js';
import { type StoreResultSchema } from '../schemas/outputs.js';
import { wrapToolHandler } from './progress.js';

type StoreInput = z.infer<typeof StoreMemoryInputSchema>;

function toInsertParams(
  params: Pick<StoreInput, 'content' | 'tags' | 'importance'>,
  hash: string,
  memoryType: string,
  now: string
): [string, string, string, string, number, string, string] {
  return [
    hash,
    params.content,
    JSON.stringify(params.tags),
    memoryType,
    params.importance,
    now,
    now,
  ];
}

function insertMemory(
  db: TypedDb,
  params: StoreInput,
  hash: string,
  memoryType: string,
  now: string
): boolean {
  const insertResult = db
    .prepareOnce(INSERT_MEMORY_SQL)
    .run(...toInsertParams(params, hash, memoryType, now));
  return insertResult.changes > 0;
}

export function registerStoreMemory(server: McpServer, db: TypedDb): void {
  const contract = getToolContract('store_memory');
  server.registerTool(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema as typeof StoreMemoryInputSchema,
      outputSchema: contract.outputSchema as typeof StoreResultSchema,
      annotations: contract.annotations,
    },
    wrapToolHandler(
      async (params: StoreInput) => {
        try {
          const memoryType = params.memory_type ?? 'general';
          const hash = computeMemoryHash(params.content, params.tags);
          const now = new Date().toISOString();
          const created = insertMemory(db, params, hash, memoryType, now);
          await logToolEvent(server, 'store', { hash, created });
          if (created) {
            await notifyMemoryResourceUpdated(server, hash);
          }

          return createToolResponse({ hash, created });
        } catch (err) {
          rethrowMcpError(err);
          return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
        }
      },
      {
        progressMessage: (params: StoreInput) =>
          `⊕ store_memory: ${params.tags.length} tags [single]`,
      }
    )
  );
}
