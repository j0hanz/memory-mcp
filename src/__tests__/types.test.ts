import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseTags } from '../lib/types.js';

describe('parseTags', () => {
  it('parses a valid tag array', () => {
    assert.deepEqual(parseTags('["a","b"]'), ['a', 'b']);
  });

  it('returns empty array for malformed json', () => {
    assert.deepEqual(parseTags('{]'), []);
  });

  it('returns empty array for non-string arrays', () => {
    assert.deepEqual(parseTags('[1,2,3]'), []);
  });
});
