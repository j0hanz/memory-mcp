import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { createHash } from 'node:crypto';

import { E_INVALID_CURSOR } from './errors.js';
import type { MemoryFilters } from './search.js';

const CURSOR_ENCODING = 'base64url';
const CURSOR_VERSION = 2;
const CURSOR_KIND = 'fts-keyset';
const CURSOR_SCOPE_HASH_LENGTH = 24;
const HASH_64_REGEX = /^[a-f0-9]{64}$/;

interface KeysetCursorPayload {
  v: typeof CURSOR_VERSION;
  kind: typeof CURSOR_KIND;
  scope: string;
  rank: number;
  hash: string;
}

interface LegacyOffsetCursorPayload {
  offset: number;
}

export type DecodedSearchCursor =
  | {
      mode: 'keyset';
      rank: number;
      hash: string;
    }
  | {
      mode: 'offset';
      offset: number;
    };

function invalidCursor(reason: string): McpError {
  return new McpError(
    ErrorCode.InvalidParams,
    `${E_INVALID_CURSOR}: ${reason}`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKeysetCursorPayload(value: unknown): value is KeysetCursorPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value['v'] === CURSOR_VERSION &&
    value['kind'] === CURSOR_KIND &&
    typeof value['scope'] === 'string' &&
    typeof value['rank'] === 'number' &&
    Number.isFinite(value['rank']) &&
    typeof value['hash'] === 'string' &&
    HASH_64_REGEX.test(value['hash'])
  );
}

function isLegacyOffsetCursorPayload(
  value: unknown
): value is LegacyOffsetCursorPayload {
  if (!isRecord(value)) {
    return false;
  }

  const { offset } = value;
  return (
    typeof offset === 'number' &&
    Number.isInteger(offset) &&
    Number.isFinite(offset) &&
    offset >= 0
  );
}

function parseCursorPayload(cursor: string): unknown {
  try {
    const json = Buffer.from(cursor, CURSOR_ENCODING).toString();
    return JSON.parse(json);
  } catch {
    throw invalidCursor('malformed cursor');
  }
}

function toScopeInput(query: string, filters: MemoryFilters): string {
  return JSON.stringify({
    query,
    min_importance: filters.min_importance ?? null,
    max_importance: filters.max_importance ?? null,
    memory_type: filters.memory_type ?? null,
  });
}

export function buildSearchCursorScope(
  query: string,
  filters: MemoryFilters
): string {
  return createHash('sha256')
    .update(toScopeInput(query, filters))
    .digest('hex')
    .slice(0, CURSOR_SCOPE_HASH_LENGTH);
}

export function encodeSearchCursor(
  scope: string,
  rank: number,
  hash: string
): string {
  const payload: KeysetCursorPayload = {
    v: CURSOR_VERSION,
    kind: CURSOR_KIND,
    scope,
    rank,
    hash,
  };
  return Buffer.from(JSON.stringify(payload)).toString(CURSOR_ENCODING);
}

export function decodeSearchCursor(
  cursor: string,
  expectedScope: string
): DecodedSearchCursor {
  const payload = parseCursorPayload(cursor);

  if (isKeysetCursorPayload(payload)) {
    if (payload.scope !== expectedScope) {
      throw invalidCursor('cursor does not match current query or filters');
    }

    return {
      mode: 'keyset',
      rank: payload.rank,
      hash: payload.hash,
    };
  }

  if (isLegacyOffsetCursorPayload(payload)) {
    return {
      mode: 'offset',
      offset: payload.offset,
    };
  }

  throw invalidCursor('malformed cursor');
}
