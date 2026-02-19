import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolResultPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isOkStructuredToolResult(result: CallToolResult): boolean {
  const structured = result.structuredContent;
  return isRecord(structured) && structured['ok'] === true;
}

export function getToolResultPayload(
  result: CallToolResult
): ToolResultPayload | undefined {
  if (!isOkStructuredToolResult(result)) {
    return undefined;
  }

  const structured = result.structuredContent as Record<string, unknown>;
  const payload = structured['result'];
  return isRecord(payload) ? payload : undefined;
}
