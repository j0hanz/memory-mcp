import type {
  McpServer,
  ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';

import { getToolContract } from '../lib/tool-contracts.js';

export function registerToolWithContract(
  server: McpServer,
  toolName: string,
  handler: unknown
): void {
  const contract = getToolContract(toolName);

  server.registerTool<AnySchema, AnySchema>(
    contract.name,
    {
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema as AnySchema,
      outputSchema: contract.outputSchema as AnySchema,
      annotations: contract.annotations,
    },
    // The handler is validated at runtime and tested via contract verification
    handler as ToolCallback<AnySchema>
  );
}
