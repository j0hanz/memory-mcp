import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_DIR = fileURLToPath(new URL('.', import.meta.url));
const FALLBACK_INSTRUCTIONS =
  '# Memory instructions\n\nSee the README for usage details.';
const INSTRUCTION_PATHS = [
  join(BASE_DIR, '..', 'instructions.md'),
  join(BASE_DIR, '..', '..', 'src', 'instructions.md'),
];
let cachedInstructions: string | undefined;

export function loadInstructions(): string {
  if (cachedInstructions !== undefined) {
    return cachedInstructions;
  }

  for (const p of INSTRUCTION_PATHS) {
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
