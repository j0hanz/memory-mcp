import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_DIR = fileURLToPath(new URL('.', import.meta.url));
const FALLBACK_INSTRUCTIONS =
  '# Memory instructions\n\nSee the README for usage details.';
let cachedInstructions: string | undefined;

function getInstructionPaths(): string[] {
  return [
    join(BASE_DIR, '..', 'instructions.md'),
    join(BASE_DIR, '..', '..', 'src', 'instructions.md'),
  ];
}

export function loadInstructions(): string {
  if (cachedInstructions !== undefined) {
    return cachedInstructions;
  }

  const paths = getInstructionPaths();
  for (const p of paths) {
    try {
      cachedInstructions = readFileSync(p, 'utf8');
      return cachedInstructions;
    } catch {
      // try next path
    }
  }

  cachedInstructions = FALLBACK_INSTRUCTIONS;
  return cachedInstructions;
}
