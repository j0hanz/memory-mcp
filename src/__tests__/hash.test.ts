import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeMemoryHash } from '../lib/hash.js';

function hash(content: string, tags: string[]): string {
  return computeMemoryHash(content, tags);
}

describe('computeMemoryHash', () => {
  it('returns a 64-char lowercase hex string', () => {
    assert.match(hash('hello world', ['test', 'memory']), /^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same inputs', () => {
    const h1 = hash('content', ['a', 'b']);
    const h2 = hash('content', ['a', 'b']);
    assert.equal(h1, h2);
  });

  it('is tag-order independent', () => {
    const h1 = hash('content', ['a', 'b', 'c']);
    const h2 = hash('content', ['c', 'a', 'b']);
    assert.equal(h1, h2);
  });

  it('differs for different content', () => {
    const h1 = hash('hello', ['tag']);
    const h2 = hash('world', ['tag']);
    assert.notEqual(h1, h2);
  });

  it('differs for different tags', () => {
    const h1 = hash('content', ['a']);
    const h2 = hash('content', ['b']);
    assert.notEqual(h1, h2);
  });
});
