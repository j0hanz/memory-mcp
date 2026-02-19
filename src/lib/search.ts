import type { SQLInputValue } from 'node:sqlite';

import type { TypedDb } from '../db/typed.js';
import type { MemoryRow } from './types.js';

const FTS_SAFE_TOKEN_REGEX = /[A-Za-z0-9_]+/g;
const FTS_EMPTY_QUERY_FALLBACK = '"__mcp_no_results__"';
const BASE_RANKED_SEARCH_SQL = `SELECT m.*, memories_fts.rank AS rank FROM memories m
         JOIN memories_fts ON memories_fts.rowid = m.rowid`;

function tokenizeQuery(query: string): string[] {
  return query.match(FTS_SAFE_TOKEN_REGEX) ?? [];
}

export function sanitizeFtsQuery(query: string): string {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return FTS_EMPTY_QUERY_FALLBACK;
  }

  return tokens.map((token) => `"${token}"`).join(' ');
}

export interface MemoryFilters {
  min_importance?: number;
  max_importance?: number;
  memory_type?: string;
}

export interface FilterClauses {
  clauses: string[];
  params: SQLInputValue[];
}

export type SearchCursorState =
  | {
      mode: 'offset';
      offset: number;
    }
  | {
      mode: 'keyset';
      rank: number;
      hash: string;
    };

const FILTER_RULES: readonly {
  key: keyof MemoryFilters;
  clause: string;
}[] = [
  { key: 'min_importance', clause: 'm.importance >= ?' },
  { key: 'max_importance', clause: 'm.importance <= ?' },
  { key: 'memory_type', clause: 'm.memory_type = ?' },
];

export function buildFilterClauses(filters: MemoryFilters): FilterClauses {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];

  for (const rule of FILTER_RULES) {
    const value = filters[rule.key];
    if (value != null) {
      clauses.push(rule.clause);
      params.push(value);
    }
  }

  return { clauses, params };
}

export function buildAndWhereClause(clauses: readonly string[]): string {
  if (clauses.length === 0) {
    return '';
  }

  return clauses.map((clause) => ` AND ${clause}`).join('');
}

function buildRankedSearchSql(
  whereExtra: string,
  cursor: SearchCursorState | undefined
): string {
  if (!cursor || cursor.mode === 'offset') {
    return `${BASE_RANKED_SEARCH_SQL}
         WHERE memories_fts MATCH ?${whereExtra}
         ORDER BY memories_fts.rank, m.hash
         LIMIT ? OFFSET ?`;
  }

  return `${BASE_RANKED_SEARCH_SQL}
       WHERE memories_fts MATCH ?${whereExtra}
         AND (
           memories_fts.rank > ?
           OR (memories_fts.rank = ? AND m.hash > ?)
         )
       ORDER BY memories_fts.rank, m.hash
       LIMIT ?`;
}

export function loadRankedSearchRows(
  db: TypedDb,
  query: string,
  limit: number,
  cursor: SearchCursorState | undefined,
  filters: MemoryFilters
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  const filter = buildFilterClauses(filters);
  const whereExtra = buildAndWhereClause(filter.clauses);
  const sql = buildRankedSearchSql(whereExtra, cursor);
  const stmt = db.prepareOnce<MemoryRow>(sql);

  if (!cursor || cursor.mode === 'offset') {
    const offset = cursor?.offset ?? 0;
    return stmt.all(ftsQuery, ...filter.params, limit + 1, offset);
  }

  return stmt.all(
    ftsQuery,
    ...filter.params,
    cursor.rank,
    cursor.rank,
    cursor.hash,
    limit + 1
  );
}

export function toMemoryFilters(params: {
  min_importance?: number | undefined;
  max_importance?: number | undefined;
  memory_type?: string | undefined;
}): MemoryFilters {
  return {
    ...(params.min_importance != null
      ? { min_importance: params.min_importance }
      : {}),
    ...(params.max_importance != null
      ? { max_importance: params.max_importance }
      : {}),
    ...(params.memory_type != null ? { memory_type: params.memory_type } : {}),
  };
}
