import { createHash } from 'node:crypto';

function normalizeTags(tags: string[]): string[] {
  return [...tags].sort();
}

export function computeMemoryHash(content: string, tags: string[]): string {
  return createHash('sha256')
    .update(content)
    .update(JSON.stringify(normalizeTags(tags)))
    .digest('hex');
}
