/** Shared SQL statement constants. Centralised here to ensure all callers
 *  cache the same string key via `prepareOnce`. */

/** Insert or silently ignore a duplicate memory (content+tags hash is PK). */
export const INSERT_MEMORY_SQL = `INSERT OR IGNORE INTO memories (hash, content, tags, memory_type, importance, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

/** Delete one memory row by hash. Relationships cascade via FK. */
export const DELETE_MEMORY_SQL = 'DELETE FROM memories WHERE hash = ?';

/** Fetch a full memory row by hash. */
export const SELECT_MEMORY_BY_HASH_SQL =
  'SELECT * FROM memories WHERE hash = ?';

/** Check existence: returns only the hash column to minimise data transfer. */
export const SELECT_MEMORY_HASH_SQL =
  'SELECT hash FROM memories WHERE hash = ?';

/** Aggregate memory store stats in a single scan. */
export const MEMORY_AGGREGATE_SQL =
  'SELECT COUNT(*) AS total, MIN(created_at) AS oldest, MAX(created_at) AS newest, AVG(importance) AS avg_importance FROM memories';

/** Total relationship count. */
export const RELATIONSHIP_COUNT_SQL =
  'SELECT COUNT(*) AS total FROM relationships';

/** Per-type memory breakdown. */
export const TYPE_COUNTS_SQL =
  'SELECT memory_type, COUNT(*) AS count FROM memories GROUP BY memory_type ORDER BY count DESC';
