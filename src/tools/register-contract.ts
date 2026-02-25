import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { z } from 'zod/v4';

import { getToolContract } from '../lib/tool-contracts.js';

export function registerToolWithContract(
  server: McpServer,
  toolName: string,
  _inputSchema: z.ZodType,
  _outputSchema: z.ZodType,
  handler: unknown
): void {
  const contract = getToolContract(toolName);

  server.registerTool(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema,
      outputSchema: contract.outputSchema,
      annotations: contract.annotations,
    },
    handler as never
  );
}
