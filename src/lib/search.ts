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
