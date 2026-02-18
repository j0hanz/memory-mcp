import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { E_INVALID_CURSOR } from './errors.js';

interface CursorPayload {
  offset: number;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as Record<string, unknown>)['offset'] === 'number';
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

export function decodeCursor(cursor: string): number {
  try {
    const json = Buffer.from(cursor, 'base64url').toString();
    const parsed: unknown = JSON.parse(json);
    if (!isCursorPayload(parsed)) {
      throw new Error('Invalid cursor structure');
    }
    return parsed.offset;
  } catch {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${E_INVALID_CURSOR}: malformed cursor`
    );
  }
}
