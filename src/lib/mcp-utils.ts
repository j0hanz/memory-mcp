import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';
type ConnectedServer = McpServer;

function isConnected(server: McpServer): server is ConnectedServer {
  return server.isConnected();
}

export async function logToolEvent(
  server: McpServer,
  logger: string,
  data: unknown,
  level: LogLevel = 'info'
): Promise<void> {
  if (!isConnected(server)) {
    return;
  }

  try {
    await server.server.sendLoggingMessage({ level, logger, data });
  } catch {
    // best-effort logging
  }
}

const MEMORY_RESOURCE_URI_PREFIX = 'memory://memories/';

export async function notifyMemoryResourceUpdated(
  server: McpServer,
  hash: string
): Promise<void> {
  if (!isConnected(server)) {
    return;
  }

  try {
    await server.server.sendResourceUpdated({
      uri: `${MEMORY_RESOURCE_URI_PREFIX}${hash}`,
    });
  } catch {
    // best-effort notification
  }
}
