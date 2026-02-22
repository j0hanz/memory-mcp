import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface TextContent {
  type: 'text';
  text: string;
}

interface StructuredErrorResponse extends Record<string, unknown> {
  ok: boolean;
}

function toTextContent(value: unknown): TextContent {
  return { type: 'text', text: JSON.stringify(value) };
}

function createStructuredError(
  code: string,
  message: string
): StructuredErrorResponse {
  return {
    ok: false,
    error: { code, message },
  };
}

export function createToolResponse(
  payload: Record<string, unknown>
): CallToolResult {
  return {
    content: [toTextContent(payload)],
    structuredContent: payload,
  };
}

export function createErrorResponse(
  code: string,
  message: string
): CallToolResult {
  return {
    content: [toTextContent(createStructuredError(code, message))],
    isError: true,
  };
}
