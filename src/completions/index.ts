import type { TypedDb } from '../db/typed.js';
import type { HashRow } from '../lib/types.js';

const HASH_MAX_LENGTH = 64;
const HASH_COMPLETION_LIMIT = 101;
const HASH_COMPLETION_SQL = `SELECT hash FROM memories WHERE hash LIKE ? ESCAPE '\\' ORDER BY hash LIMIT ${HASH_COMPLETION_LIMIT}`;

function normalizeHashPrefix(value: string): string {
  return escapeLikePattern(value.slice(0, HASH_MAX_LENGTH));
}

// Returns a completion callback for the `hash` URI variable.
export function createHashCompletionCallback(
  db: TypedDb
): (value: string) => string[] {
  return (value: string): string[] => {
    const escapedPrefix = normalizeHashPrefix(value);
    return db
      .prepareOnce<HashRow>(HASH_COMPLETION_SQL)
      .all(`${escapedPrefix}%`)
      .map((row) => row.hash);
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}
