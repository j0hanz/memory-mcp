import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function createToolResponse(structured: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured as Record<string, unknown>,
  };
}

export function createErrorResponse(
  code: string,
  message: string
): CallToolResult {
  const structured = { ok: false, error: { code, message } };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true,
  };
}
