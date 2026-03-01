export interface PageSlice<T> {
  page: T[];
  hasMore: boolean;
}

export function splitPage<T>(rows: readonly T[], limit: number): PageSlice<T> {
  if (rows.length > limit) {
    return { page: rows.slice(0, limit), hasMore: true };
  }

  return { page: rows.slice(), hasMore: false };
}
