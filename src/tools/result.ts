import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { E_CANCELLED } from '../lib/errors.js';

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

export function getToolResultText(result: CallToolResult): string {
  const first = result.content[0];
  return first?.type === 'text' ? first.text : '';
}

/** Count items in a named array field of a tool result payload. */
export function countPayloadArrayItems(
  payload: Record<string, unknown>,
  key: string
): number {
  const value = payload[key];
  return Array.isArray(value) ? value.length : 0;
}

/** Standardize format of tool completion messages. */
export function formatToolCompletionMessage(
  toolName: string,
  query: string,
  result: CallToolResult,
  getSuccessMessage: (payload: ToolResultPayload) => string
): string {
  const failedMessage = `⊙ ${toolName}: ${query} • failed`;
  if (result.isError) {
    const text = getToolResultText(result);
    if (text.includes(E_CANCELLED)) {
      return `⊙ ${toolName}: ${query} • cancelled`;
    }
    return failedMessage;
  }
  if (!isOkStructuredToolResult(result)) {
    return failedMessage;
  }

  const payload = getToolResultPayload(result);
  if (!payload) {
    return `⊙ ${toolName}: ${query} • completed`;
  }

  const successSuffix = getSuccessMessage(payload);
  return `⊙ ${toolName}: ${query} • ${successSuffix}`;
}

export function formatHashPreview(hash: string, length = 12): string {
  return `${hash.slice(0, length)}...`;
}

export function formatRelationshipPreview(
  fromHash: string,
  toHash: string,
  length = 8
): string {
  return `${formatHashPreview(fromHash, length)} -> ${formatHashPreview(toHash, length)}`;
}
