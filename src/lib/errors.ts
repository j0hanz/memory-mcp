export const E_NOT_FOUND = 'E_NOT_FOUND';
export const E_DUPLICATE = 'E_DUPLICATE';
export const E_CONSTRAINT = 'E_CONSTRAINT';
export const E_INVALID_CURSOR = 'E_INVALID_CURSOR';
export const E_TIMEOUT = 'E_TIMEOUT';
export const E_UNKNOWN = 'E_UNKNOWN';

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error occurred';
}
