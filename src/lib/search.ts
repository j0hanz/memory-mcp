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

interface SearchPlan {
  sql: string;
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

  return ` AND ${clauses.join(' AND ')}`;
}

function buildBaseSearchWhere(whereExtra: string): string {
  return `${BASE_RANKED_SEARCH_SQL}
         WHERE memories_fts MATCH ?${whereExtra}`;
}

function buildRankedSearchSql(
  whereExtra: string,
  cursor: SearchCursorState | undefined
): string {
  const whereSql = buildBaseSearchWhere(whereExtra);
  if (!cursor || cursor.mode === 'offset') {
    return `${whereSql}
         ORDER BY memories_fts.rank, m.hash
         LIMIT ? OFFSET ?`;
  }

  return `${whereSql}
         AND (
           memories_fts.rank > ?
           OR (memories_fts.rank = ? AND m.hash > ?)
         )
       ORDER BY memories_fts.rank, m.hash
       LIMIT ?`;
}

function buildRankedSearchParams(
  ftsQuery: string,
  filterParams: readonly SQLInputValue[],
  limit: number,
  cursor: SearchCursorState | undefined
): SQLInputValue[] {
  const baseParams = [ftsQuery, ...filterParams];
  if (!cursor || cursor.mode === 'offset') {
    const offset = cursor?.offset ?? 0;
    return [...baseParams, limit + 1, offset];
  }

  return [...baseParams, cursor.rank, cursor.rank, cursor.hash, limit + 1];
}

function buildSearchPlan(
  query: string,
  limit: number,
  cursor: SearchCursorState | undefined,
  filters: MemoryFilters
): SearchPlan {
  const filter = buildFilterClauses(filters);
  const sql = buildRankedSearchSql(buildAndWhereClause(filter.clauses), cursor);
  const params = buildRankedSearchParams(query, filter.params, limit, cursor);
  return { sql, params };
}

export function loadRankedSearchRows(
  db: TypedDb,
  query: string,
  limit: number,
  cursor: SearchCursorState | undefined,
  filters: MemoryFilters
): MemoryRow[] {
  const ftsQuery = sanitizeFtsQuery(query);
  const plan = buildSearchPlan(ftsQuery, limit, cursor, filters);
  return db.prepareOnce<MemoryRow>(plan.sql).all(...plan.params);
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
