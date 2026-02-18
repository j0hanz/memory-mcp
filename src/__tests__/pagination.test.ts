import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeCursor, encodeCursor } from '../lib/pagination.js';

function toCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('pagination cursor', () => {
  it('encodes and decodes valid offsets', () => {
    const cursor = encodeCursor(42);
    assert.equal(decodeCursor(cursor), 42);
  });

  it('rejects negative offsets', () => {
    assert.throws(
      () => decodeCursor(toCursor({ offset: -1 })),
      /E_INVALID_CURSOR/
    );
  });

  it('rejects fractional offsets', () => {
    assert.throws(
      () => decodeCursor(toCursor({ offset: 1.5 })),
      /E_INVALID_CURSOR/
    );
  });

  it('rejects non-finite offsets', () => {
    assert.throws(
      () => decodeCursor(toCursor({ offset: Number.POSITIVE_INFINITY })),
      /E_INVALID_CURSOR/
    );
  });
});
