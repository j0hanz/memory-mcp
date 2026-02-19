import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProgressNotification } from '@modelcontextprotocol/sdk/types.js';

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
  const registry = (
    server as unknown as {
      _registeredTools?: Record<string, TestToolDefinition>;
    }
  )._registeredTools;
  return registry ?? {};
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

interface ProgressExtraOptions {
  signal?: AbortSignal;
}

interface ProgressCallOutcome {
  notifications: ProgressNotification[];
  result?: ToolCallResult;
  error?: unknown;
}

export async function callToolWithProgress(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
  options: ProgressExtraOptions = {}
): Promise<ProgressCallOutcome> {
  const tools = getRegisteredTools(server);
  const tool = tools[toolName];
  if (!tool) {
    throw new Error(`Tool not registered: ${toolName}`);
  }

  const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
  const notifications: ProgressNotification[] = [];
  const extra = {
    _meta: { progressToken: 'test-progress-token' },
    sendNotification: async (
      notification: ProgressNotification
    ): Promise<void> => {
      notifications.push(notification);
    },
    ...(options.signal ? { signal: options.signal } : {}),
  };

  try {
    const result = (await tool.handler(parsed, extra)) as ToolCallResult;
    return { notifications, result };
  } catch (error) {
    return { notifications, error };
  }
}
