import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface TextContent {
  type: 'text';
  text: string;
}

interface StructuredToolResponse extends Record<string, unknown> {
  ok: boolean;
}

function toTextContent(value: unknown): TextContent {
  return { type: 'text', text: JSON.stringify(value) };
}

function createStructuredError(
  code: string,
  message: string
): StructuredToolResponse {
  return {
    ok: false,
    error: { code, message },
  };
}

function buildResponse(
  structured: Record<string, unknown>,
  isError = false
): CallToolResult {
  return {
    content: [toTextContent(structured)],
    structuredContent: structured,
    ...(isError ? { isError: true } : {}),
  };
}

export function createToolResponse(
  payload: Record<string, unknown>
): CallToolResult {
  return buildResponse(payload);
}

export function createErrorResponse(
  code: string,
  message: string
): CallToolResult {
  return buildResponse(createStructuredError(code, message), true);
}
