import { registerCreateRelationship } from './create-relationship.js';
import { registerDeleteMemories } from './delete-memories.js';
import { registerDeleteMemory } from './delete-memory.js';
import { registerDeleteRelationship } from './delete-relationship.js';
import { registerGetMemory } from './get-memory.js';
import { registerGetRelationships } from './get-relationships.js';
import { registerMemoryStats } from './memory-stats.js';
import { registerRecall } from './recall.js';
import { registerRetrieveContext } from './retrieve-context.js';
import { registerSearchMemories } from './search-memories.js';
import { registerStoreMemories } from './store-memories.js';
import { registerStoreMemory } from './store-memory.js';
import { registerUpdateMemory } from './update-memory.js';

export const TOOL_REGISTRARS = [
  registerStoreMemory,
  registerGetMemory,
  registerUpdateMemory,
  registerDeleteMemory,
  registerMemoryStats,
  registerStoreMemories,
  registerDeleteMemories,
  registerSearchMemories,
  registerCreateRelationship,
  registerDeleteRelationship,
  registerGetRelationships,
  registerRecall,
  registerRetrieveContext,
] as const;
