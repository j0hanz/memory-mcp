const FTS_UNSAFE_CHARS_REGEX = /['"*]/g;

export function sanitizeFtsQuery(query: string): string {
  return query.replace(FTS_UNSAFE_CHARS_REGEX, ' ').trim();
}
