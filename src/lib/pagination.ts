import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { E_INVALID_CURSOR } from './errors.js';

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

export function decodeCursor(cursor: string): number {
  try {
    const json = Buffer.from(cursor, 'base64url').toString();
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('offset' in parsed) ||
      typeof (parsed as Record<string, unknown>)['offset'] !== 'number'
    ) {
      throw new Error('Invalid cursor structure');
    }
    return (parsed as { offset: number }).offset;
  } catch {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${E_INVALID_CURSOR}: malformed cursor`
    );
  }
}
