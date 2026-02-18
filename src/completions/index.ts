import type { DatabaseSync } from 'node:sqlite';

interface HashRow {
  hash: string;
}

const HASH_MAX_LENGTH = 64;
const HASH_COMPLETION_LIMIT = 101;

/**
 * Returns a completion callback for the `hash` URI variable.
 * Used by ResourceTemplate to provide autocomplete on memory hash values.
 */
export function createHashCompletionCallback(
  db: DatabaseSync
): (value: string) => string[] {
  return (value: string): string[] => {
    const prefix = value.slice(0, HASH_MAX_LENGTH);
    const rows = db
      .prepare(
        `SELECT hash FROM memories WHERE hash LIKE ? ORDER BY hash LIMIT ${HASH_COMPLETION_LIMIT}`
      )
      .all(`${prefix}%`) as unknown as HashRow[];
    return rows.map((r) => r.hash);
  };
}
