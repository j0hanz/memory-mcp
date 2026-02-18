import { createHash } from 'node:crypto';

export function computeMemoryHash(content: string, tags: string[]): string {
  return createHash('sha256')
    .update(content)
    .update(JSON.stringify([...tags].sort()))
    .digest('hex');
}
