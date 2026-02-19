import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';

export async function logToolEvent(
  server: McpServer,
  logger: string,
  data: unknown,
  level: LogLevel = 'info'
): Promise<void> {
  if (!server.isConnected()) {
    return;
  }

  try {
    await server.server.sendLoggingMessage({ level, logger, data });
  } catch {
    // best-effort logging
  }
}

export async function notifyMemoryResourceUpdated(
  server: McpServer,
  uri: string
): Promise<void> {
  if (!server.isConnected()) {
    return;
  }

  try {
    await server.server.sendResourceUpdated({ uri });
  } catch {
    // best-effort notification
  }
}
