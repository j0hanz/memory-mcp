import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProgressNotification } from '@modelcontextprotocol/sdk/types.js';

interface TestToolDefinition {
  inputSchema?: { parse(value: unknown): unknown };
  handler: (args: unknown, extra: unknown) => Promise<unknown>;
  execution?: { taskSupport?: 'required' | 'optional' | 'forbidden' };
}

interface ToolCallResult {
  structuredContent: unknown;
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

interface TestPromptDefinition {
  callback: (args?: unknown, extra?: unknown) => Promise<unknown> | unknown;
}

interface TestResourceDefinition {
  readCallback: () => Promise<unknown> | unknown;
}

interface TestResourceTemplateDefinition {
  readCallback: (
    uri: URL,
    variables: Record<string, string>
  ) => Promise<unknown> | unknown;
}

function requireRegistry<T>(registry: T | undefined, name: string): T {
  if (registry === undefined) {
    throw new Error(
      `MCP SDK internal registry ${name} is unavailable; check SDK compatibility for test helpers.`
    );
  }

  return registry;
}

function getRegisteredTools(
  server: McpServer
): Record<string, TestToolDefinition> {
  const registry = (
    server as unknown as {
      _registeredTools?: Record<string, TestToolDefinition>;
    }
  )._registeredTools;
  return requireRegistry(registry, '_registeredTools');
}

function getRegisteredPrompts(
  server: McpServer
): Record<string, TestPromptDefinition> {
  const registry = (
    server as unknown as {
      _registeredPrompts?: Record<string, TestPromptDefinition>;
    }
  )._registeredPrompts;
  return requireRegistry(registry, '_registeredPrompts');
}

function getRegisteredResources(
  server: McpServer
): Record<string, TestResourceDefinition> {
  const registry = (
    server as unknown as {
      _registeredResources?: Record<string, TestResourceDefinition>;
    }
  )._registeredResources;
  return requireRegistry(registry, '_registeredResources');
}

function getRegisteredResourceTemplates(
  server: McpServer
): Record<string, TestResourceTemplateDefinition> {
  const registry = (
    server as unknown as {
      _registeredResourceTemplates?: Record<
        string,
        TestResourceTemplateDefinition
      >;
    }
  )._registeredResourceTemplates;
  return requireRegistry(registry, '_registeredResourceTemplates');
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

export function getRegisteredToolsSnapshot(
  server: McpServer
): Record<string, TestToolDefinition> {
  return getRegisteredTools(server);
}

export async function callPrompt(
  server: McpServer,
  promptName: string,
  args: Record<string, unknown> = {},
  extra: unknown = {}
): Promise<unknown> {
  const prompts = getRegisteredPrompts(server);
  const prompt = prompts[promptName];
  if (!prompt) {
    throw new Error(`Prompt not registered: ${promptName}`);
  }

  return prompt.callback(args, extra);
}

export async function readStaticResource(
  server: McpServer,
  uri: string
): Promise<unknown> {
  const resources = getRegisteredResources(server);
  const resource = resources[uri];
  if (!resource) {
    throw new Error(`Resource not registered: ${uri}`);
  }

  return resource.readCallback();
}

export async function readTemplateResource(
  server: McpServer,
  templateName: string,
  uri: URL,
  variables: Record<string, string>
): Promise<unknown> {
  const templates = getRegisteredResourceTemplates(server);
  const resourceTemplate = templates[templateName];
  if (!resourceTemplate) {
    throw new Error(`Resource template not registered: ${templateName}`);
  }

  return resourceTemplate.readCallback(uri, variables);
}
