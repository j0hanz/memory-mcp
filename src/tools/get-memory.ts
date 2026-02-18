import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import type { TypedDb } from '../db/typed.js';
import { E_NOT_FOUND, E_UNKNOWN, getErrorMessage } from '../lib/errors.js';
import {
  createErrorResponse,
  createToolResponse,
} from '../lib/tool-response.js';
import { parseMemoryRow } from '../lib/types.js';
import { GetMemoryInputSchema } from '../schemas/inputs.js';
import { MemoryResultSchema } from '../schemas/outputs.js';
import { getMemoryRow } from './helpers.js';

type GetInput = z.infer<typeof GetMemoryInputSchema>;

export function registerGetMemory(server: McpServer, db: TypedDb): void {
  server.registerTool(
    'get_memory',
    {
      title: 'Get Memory',
      description: 'Retrieve a single memory by its SHA-256 hash.',
      inputSchema: GetMemoryInputSchema,
      outputSchema: MemoryResultSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (params: GetInput) => {
      try {
        const row = getMemoryRow(db, params.hash);

        if (!row) {
          return createErrorResponse(
            E_NOT_FOUND,
            `Memory not found: ${params.hash}`
          );
        }

        return createToolResponse({ ok: true, result: parseMemoryRow(row) });
      } catch (err) {
        return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
      }
    }
  );
}
