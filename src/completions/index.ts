import type { DatabaseSync } from 'node:sqlite';

interface HashRow {
  hash: string;
}

/**
 * Returns a completion callback for the `hash` URI variable.
 * Used by ResourceTemplate to provide autocomplete on memory hash values.
 */
export function createHashCompletionCallback(
  db: DatabaseSync
): (value: string) => string[] {
  return (value: string): string[] => {
    const prefix = value.slice(0, 64); // max hash length
    const rows = db
      .prepare(
        'SELECT hash FROM memories WHERE hash LIKE ? ORDER BY hash LIMIT 101'
      )
      .all(`${prefix}%`) as unknown as HashRow[];
    return rows.map((r) => r.hash);
  };
}
