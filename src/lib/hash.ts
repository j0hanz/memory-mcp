import { createHash } from 'node:crypto';

const MEMORY_HASH_ALGORITHM = 'sha256';

function normalizeTags(tags: readonly string[]): readonly string[] {
  if (tags.length < 2) {
    return tags;
  }

  return [...tags].sort();
}

function stableTagsJson(tags: readonly string[]): string {
  return JSON.stringify(normalizeTags(tags));
}

export function computeMemoryHash(
  content: string,
  tags: readonly string[]
): string {
  return createHash(MEMORY_HASH_ALGORITHM)
    .update(content)
    .update(stableTagsJson(tags))
    .digest('hex');
}
