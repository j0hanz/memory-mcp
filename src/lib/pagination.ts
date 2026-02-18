import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { E_INVALID_CURSOR } from './errors.js';

const CURSOR_ENCODING = 'base64url';

interface CursorPayload {
  offset: number;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as Record<string, unknown>)['offset'] === 'number';
}

function parseCursorPayload(cursor: string): CursorPayload {
  const json = Buffer.from(cursor, CURSOR_ENCODING).toString();
  const parsed: unknown = JSON.parse(json);
  if (!isCursorPayload(parsed)) {
    throw new Error('Invalid cursor structure');
  }
  return parsed;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString(CURSOR_ENCODING);
}

export function decodeCursor(cursor: string): number {
  try {
    return parseCursorPayload(cursor).offset;
  } catch {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${E_INVALID_CURSOR}: malformed cursor`
    );
  }
}
