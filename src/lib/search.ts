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
  min_importance?: number;
  max_importance?: number;
  memory_type?: string;
}

export interface FilterClauses {
  clauses: string[];
  params: SQLInputValue[];
}

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

  return ` ${clauses.map((clause) => `AND ${clause}`).join(' ')}`;
}
