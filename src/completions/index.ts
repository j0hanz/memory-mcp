import type { TypedDb } from '../db/typed.js';
import type { HashRow } from '../lib/types.js';

const HASH_MAX_LENGTH = 64;
const HASH_COMPLETION_LIMIT = 101;

/**
 * Returns a completion callback for the `hash` URI variable.
 * Used by ResourceTemplate to provide autocomplete on memory hash values.
 */
export function createHashCompletionCallback(
  db: TypedDb
): (value: string) => string[] {
  return (value: string): string[] => {
    const prefix = value.slice(0, HASH_MAX_LENGTH);
    const rows = db
      .prepare<HashRow>(
        `SELECT hash FROM memories WHERE hash LIKE ? ORDER BY hash LIMIT ${HASH_COMPLETION_LIMIT}`
      )
      .all(`${prefix}%`);
    return rows.map((r) => r.hash);
  };
}
