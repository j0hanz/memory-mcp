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
    const rows = db
      .prepareOnce<HashRow>(HASH_COMPLETION_SQL)
      .all(`${escapedPrefix}%`);
    const hashes = new Array<string>(rows.length);
    let index = 0;
    for (const row of rows) {
      hashes[index] = row.hash;
      index += 1;
    }
    return hashes;
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}
