export const E_NOT_FOUND = 'E_NOT_FOUND';
export const E_INVALID_CURSOR = 'E_INVALID_CURSOR';
export const E_UNKNOWN = 'E_UNKNOWN';

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const errorAsString = typeof err === 'string' ? err : undefined;
  if (errorAsString != null) return errorAsString;
  return 'Unknown error occurred';
}
