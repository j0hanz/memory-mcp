import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeMemoryHash } from '../lib/hash.js';

describe('computeMemoryHash', () => {
  it('returns a 64-char lowercase hex string', () => {
    const hash = computeMemoryHash('hello world', ['test', 'memory']);
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same inputs', () => {
    const h1 = computeMemoryHash('content', ['a', 'b']);
    const h2 = computeMemoryHash('content', ['a', 'b']);
    assert.equal(h1, h2);
  });

  it('is tag-order independent', () => {
    const h1 = computeMemoryHash('content', ['a', 'b', 'c']);
    const h2 = computeMemoryHash('content', ['c', 'a', 'b']);
    assert.equal(h1, h2);
  });

  it('differs for different content', () => {
    const h1 = computeMemoryHash('hello', ['tag']);
    const h2 = computeMemoryHash('world', ['tag']);
    assert.notEqual(h1, h2);
  });

  it('differs for different tags', () => {
    const h1 = computeMemoryHash('content', ['a']);
    const h2 = computeMemoryHash('content', ['b']);
    assert.notEqual(h1, h2);
  });
});
