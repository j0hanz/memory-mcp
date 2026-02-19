import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_DIR = fileURLToPath(new URL('.', import.meta.url));
const FALLBACK_INSTRUCTIONS =
  '# Memory instructions\n\nSee the README for usage details.';

function getInstructionPaths(): string[] {
  return [
    join(BASE_DIR, '..', 'instructions.md'),
    join(BASE_DIR, '..', '..', 'src', 'instructions.md'),
  ];
}

export function loadInstructions(): string {
  const paths = getInstructionPaths();
  for (const p of paths) {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      // try next path
    }
  }
  return FALLBACK_INSTRUCTIONS;
}
