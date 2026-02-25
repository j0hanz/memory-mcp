import { buildServerInstructions } from '../resources/instructions.js';

let cachedInstructions: string | undefined;

export function loadInstructions(): string {
  cachedInstructions ??= buildServerInstructions();
  return cachedInstructions;
}
