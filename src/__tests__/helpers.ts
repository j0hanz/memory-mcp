import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface TestToolDefinition {
  inputSchema?: { parse(value: unknown): unknown };
  handler: (args: unknown, extra: unknown) => Promise<unknown>;
}

interface ToolCallResult {
  structuredContent: unknown;
}

function getRegisteredTools(
  server: McpServer
): Record<string, TestToolDefinition> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools as Record<string, TestToolDefinition>;
}

export async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const tools = getRegisteredTools(server);
  const tool = tools[toolName];
  if (!tool) {
    throw new Error(`Tool not registered: ${toolName}`);
  }

  const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
  return tool.handler(parsed, {}) as Promise<ToolCallResult>;
}
