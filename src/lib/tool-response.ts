import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface TextContent {
  type: 'text';
  text: string;
}

function toTextContent(value: unknown): TextContent {
  return { type: 'text', text: JSON.stringify(value) };
}

export function createToolResponse(
  structured: Record<string, unknown>
): CallToolResult {
  return {
    content: [toTextContent(structured)],
    structuredContent: structured,
  };
}

export function createErrorResponse(
  code: string,
  message: string
): CallToolResult {
  const structured = { ok: false, error: { code, message } };
  return {
    content: [toTextContent(structured)],
    structuredContent: structured,
    isError: true,
  };
}
