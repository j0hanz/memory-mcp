import type { SQLInputValue } from 'node:sqlite';

const FTS_SAFE_TOKEN_REGEX = /[A-Za-z0-9_]+/g;
const FTS_EMPTY_QUERY_FALLBACK = '"__mcp_no_results__"';

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
  min_importance?: number | undefined;
  max_importance?: number | undefined;
  memory_type?: string | undefined;
}

export interface FilterClauses {
  clauses: string[];
  params: SQLInputValue[];
}

export function buildFilterClauses(filters: MemoryFilters): FilterClauses {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.min_importance != null) {
    clauses.push('m.importance >= ?');
    params.push(filters.min_importance);
  }
  if (filters.max_importance != null) {
    clauses.push('m.importance <= ?');
    params.push(filters.max_importance);
  }
  if (filters.memory_type != null) {
    clauses.push('m.memory_type = ?');
    params.push(filters.memory_type);
  }
  return { clauses, params };
}
