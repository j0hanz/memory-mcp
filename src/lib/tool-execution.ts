import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { E_UNKNOWN, getErrorMessage, rethrowMcpError } from './errors.js';
import { createErrorResponse } from './tool-response.js';

interface BatchSummary {
  succeeded: number;
  failed: number;
  matched: number;
}

interface BatchItemLike {
  ok: boolean;
}

export async function executeToolSafely(
  work: () => Promise<CallToolResult> | CallToolResult
): Promise<CallToolResult> {
  try {
    return await work();
  } catch (err) {
    rethrowMcpError(err);
    return createErrorResponse(E_UNKNOWN, getErrorMessage(err));
  }
}

export function summarizeBatch<T extends BatchItemLike>(
  items: readonly T[],
  isMatched: (item: T) => boolean
): BatchSummary {
  let succeeded = 0;
  let matched = 0;
  for (const item of items) {
    if (item.ok) {
      succeeded += 1;
    }

    if (isMatched(item)) {
      matched += 1;
    }
  }

  return {
    succeeded,
    failed: items.length - succeeded,
    matched,
  };
}
