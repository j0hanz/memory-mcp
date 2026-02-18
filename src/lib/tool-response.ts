import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function createTextContent(value: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: JSON.stringify(value) };
}

export function createToolResponse(structured: unknown): CallToolResult {
  return {
    content: [createTextContent(structured)],
    structuredContent: structured as Record<string, unknown>,
  };
}

export function createErrorResponse(
  code: string,
  message: string
): CallToolResult {
  const structured = { ok: false, error: { code, message } };
  return {
    content: [createTextContent(structured)],
    structuredContent: structured,
    isError: true,
  };
}
