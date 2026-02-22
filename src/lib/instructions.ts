import { buildServerInstructions } from '../resources/instructions.js';

let cachedInstructions: string | undefined;

export function loadInstructions(): string {
  if (cachedInstructions !== undefined) {
    return cachedInstructions;
  }

  cachedInstructions = buildServerInstructions();
  return cachedInstructions;
}
