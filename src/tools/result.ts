import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolResultPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isOkStructuredToolResult(result: CallToolResult): boolean {
  return result.isError !== true && isRecord(result.structuredContent);
}

export function getToolResultPayload(
  result: CallToolResult
): ToolResultPayload | undefined {
  const { structuredContent } = result;
  if (result.isError === true || !isRecord(structuredContent)) {
    return undefined;
  }

  return structuredContent;
}
