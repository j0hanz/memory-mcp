import { McpError } from '@modelcontextprotocol/sdk/types.js';

export const E_NOT_FOUND = 'E_NOT_FOUND';
export const E_INVALID_CURSOR = 'E_INVALID_CURSOR';
export const E_DB_ERROR = 'E_DB_ERROR';
export const E_CONFLICT = 'E_CONFLICT';
export const E_CANCELLED = 'E_CANCELLED';
export const E_UNKNOWN = 'E_UNKNOWN';
const UNKNOWN_ERROR_MESSAGE = 'Unknown error occurred';

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return UNKNOWN_ERROR_MESSAGE;
}

export function rethrowMcpError(err: unknown): void {
  if (err instanceof McpError) throw err;
}
