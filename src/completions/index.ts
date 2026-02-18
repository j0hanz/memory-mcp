import type { TypedDb } from '../db/typed.js';
import type { HashRow } from '../lib/types.js';
import { SUGGESTED_RELATION_TYPES } from '../schemas/inputs.js';

const HASH_MAX_LENGTH = 64;
const HASH_COMPLETION_LIMIT = 101;

// Returns a completion callback for the `hash` URI variable.
export function createHashCompletionCallback(
  db: TypedDb
): (value: string) => string[] {
  return (value: string): string[] => {
    const prefix = value.slice(0, HASH_MAX_LENGTH);
    const escaped = escapeLikePattern(prefix);
    const rows = db
      .prepare<HashRow>(
        `SELECT hash FROM memories WHERE hash LIKE ? ESCAPE '\\' ORDER BY hash LIMIT ${HASH_COMPLETION_LIMIT}`
      )
      .all(`${escaped}%`);
    return rows.map((r) => r.hash);
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

// Returns a completion callback for the `relation_type` parameter.
export function createRelationTypeCompletionCallback(): (
  value: string
) => string[] {
  return (value: string): string[] => {
    const lower = value.toLowerCase();
    return SUGGESTED_RELATION_TYPES.filter((t) => t.startsWith(lower));
  };
}
