import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { E_INVALID_CURSOR } from './errors.js';

const CURSOR_ENCODING = 'base64url';

interface CursorPayload {
  offset: number;
}

export interface PageSlice<T> {
  page: T[];
  hasMore: boolean;
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { offset } = value as Record<string, unknown>;
  return isNonNegativeInteger(offset);
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
  const payload: CursorPayload = { offset };
  return Buffer.from(JSON.stringify(payload)).toString(CURSOR_ENCODING);
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

export function splitPage<T>(rows: readonly T[], limit: number): PageSlice<T> {
  if (rows.length > limit) {
    return { page: rows.slice(0, limit), hasMore: true };
  }

  return { page: [...rows], hasMore: false };
}
