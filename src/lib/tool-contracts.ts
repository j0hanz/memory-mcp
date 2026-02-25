import { type z } from 'zod/v4';

import {
  CreateRelationshipInputSchema,
  DeleteMemoriesInputSchema,
  DeleteMemoryInputSchema,
  DeleteRelationshipInputSchema,
  GetMemoryInputSchema,
  GetRelationshipsInputSchema,
  MemoryStatsInputSchema,
  RecallInputSchema,
  RetrieveContextInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoriesInputSchema,
  StoreMemoryInputSchema,
  UpdateMemoryInputSchema,
} from '../schemas/inputs.js';
import {
  BatchResultSchema,
  CreateRelationshipResultSchema,
  DeleteRelationshipResultSchema,
  DeleteResultSchema,
  MemoryResultSchema,
  RecallResultSchema,
  RelationshipResultSchema,
  RetrieveContextResultSchema,
  SearchResultSchema,
  StatsResultSchema,
  StoreResultSchema,
  UpdateResultSchema,
} from '../schemas/outputs.js';

export interface ToolContract {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  annotations: {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
}

export const TOOL_CONTRACTS: ToolContract[] = [
  {
    name: 'store_memory',
    title: 'Store Memory',
    description:
      'Store a single memory. Returns SHA-256 hash. Idempotent: existing content+tags returns `created: false`. Prefer `store_memories` for batch.',
    inputSchema: StoreMemoryInputSchema,
    outputSchema: StoreResultSchema,
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'store_memories',
    title: 'Store Memories (Batch)',
    description:
      'Store up to 50 memories atomically. Idempotent per item. Returns per-item results. Rolls back entirely on error.',
    inputSchema: StoreMemoriesInputSchema,
    outputSchema: BatchResultSchema,
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'get_memory',
    title: 'Get Memory',
    description:
      'Retrieve a single memory by exact SHA-256 hash. Returns memory object or E_NOT_FOUND. Use `search_memories` or `recall` if hash is unknown.',
    inputSchema: GetMemoryInputSchema,
    outputSchema: MemoryResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'search_memories',
    title: 'Search Memories',
    description:
      'FTS5 full-text search over content and tags. Returns ranked results with cursor pagination. Matches alphanumeric/underscore tokens with implicit AND semantics. Use `recall` to follow relationships.',
    inputSchema: SearchMemoriesInputSchema,
    outputSchema: SearchResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'retrieve_context',
    title: 'Retrieve Context',
    description:
      'FTS search with token-budget management. Returns memories up to `token_budget`. Sort `strategy`: `relevance` (default), `importance`, or `recency`. Returns `truncated: true` if budget reached. Matches alphanumeric/underscore only.',
    inputSchema: RetrieveContextInputSchema,
    outputSchema: RetrieveContextResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'recall',
    title: 'Recall (BFS Graph Traversal)',
    description:
      'FTS search then BFS graph traversal up to `depth` hops. Returns discovered memories and edges. Emits progress. Returns `aborted: true` only if safety limits hit; cancellation returns E_CANCELLED.',
    inputSchema: RecallInputSchema,
    outputSchema: RecallResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'update_memory',
    title: 'Update Memory',
    description:
      'Replace content/tags of an existing memory. Returns old and new SHA-256 hashes. Returns E_NOT_FOUND if missing, E_CONFLICT if new content+tags already exists.',
    inputSchema: UpdateMemoryInputSchema,
    outputSchema: UpdateResultSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'delete_memory',
    title: 'Delete Memory',
    description:
      'Delete a single memory by SHA-256 hash. Cascade-deletes relationships. Returns `{deleted: false}` if not found (idempotent).',
    inputSchema: DeleteMemoryInputSchema,
    outputSchema: DeleteResultSchema,
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'delete_memories',
    title: 'Delete Memories (Batch)',
    description:
      'Delete up to 50 memories atomically. Cascade-deletes relationships. Per-item `deleted: false` if not found. Rolls back entirely on error.',
    inputSchema: DeleteMemoriesInputSchema,
    outputSchema: BatchResultSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'create_relationship',
    title: 'Create Relationship',
    description:
      'Create directed labeled edge between two memories. Idempotent: existing edge returns `created: false`. Returns E_NOT_FOUND if endpoints missing.',
    inputSchema: CreateRelationshipInputSchema,
    outputSchema: CreateRelationshipResultSchema,
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'delete_relationship',
    title: 'Delete Relationship',
    description:
      'Remove a single directed relationship edge. Exact match required (from_hash, to_hash, relation_type). Returns E_NOT_FOUND if missing.',
    inputSchema: DeleteRelationshipInputSchema,
    outputSchema: DeleteRelationshipResultSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'get_relationships',
    title: 'Get Relationships',
    description:
      'Retrieve all relationships for a memory, with related memory inlined. Filter by direction (outgoing|incoming|both). Returns E_NOT_FOUND if source missing.',
    inputSchema: GetRelationshipsInputSchema,
    outputSchema: RelationshipResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'memory_stats',
    title: 'Memory Stats',
    description:
      'Return aggregate statistics: total memories, relationships, oldest/newest timestamps, average importance, and per-type counts.',
    inputSchema: MemoryStatsInputSchema,
    outputSchema: StatsResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
];
const TOOL_CONTRACTS_BY_NAME = new Map(
  TOOL_CONTRACTS.map((contract) => [contract.name, contract] as const)
);

export function getToolContracts(): ToolContract[] {
  return TOOL_CONTRACTS;
}

export function getToolContract(name: string): ToolContract {
  const contract = TOOL_CONTRACTS_BY_NAME.get(name);
  if (!contract) {
    throw new Error(`Tool contract not found: ${name}`);
  }
  return contract;
}
