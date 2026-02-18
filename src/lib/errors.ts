export const ERROR_CODES = {
  NOT_FOUND: 'E_NOT_FOUND',
  DUPLICATE: 'E_DUPLICATE',
  CONSTRAINT: 'E_CONSTRAINT',
  INVALID_CURSOR: 'E_INVALID_CURSOR',
  TIMEOUT: 'E_TIMEOUT',
  UNKNOWN: 'E_UNKNOWN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const E_NOT_FOUND = ERROR_CODES.NOT_FOUND;
export const E_DUPLICATE = ERROR_CODES.DUPLICATE;
export const E_CONSTRAINT = ERROR_CODES.CONSTRAINT;
export const E_INVALID_CURSOR = ERROR_CODES.INVALID_CURSOR;
export const E_TIMEOUT = ERROR_CODES.TIMEOUT;
export const E_UNKNOWN = ERROR_CODES.UNKNOWN;

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const errorAsString = typeof err === 'string' ? err : undefined;
  if (errorAsString != null) return errorAsString;
  return 'Unknown error occurred';
}
