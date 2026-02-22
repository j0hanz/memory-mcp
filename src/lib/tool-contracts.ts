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
      'Store a single memory with content, tags, and optional type/importance. Returns the SHA-256 hash. Idempotent — storing the same content+tags returns the existing hash with `created: false`. For storing multiple memories at once, prefer `store_memories`.',
    inputSchema: StoreMemoryInputSchema,
    outputSchema: StoreResultSchema,
    annotations: {
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'store_memories',
    title: 'Store Memories (Batch)',
    description:
      'Store up to 50 memories atomically. Each item is independently idempotent — same content+tags returns existing hash with `created: false`. Returns per-item results. Transaction rolls back entirely on unexpected error.',
    inputSchema: StoreMemoriesInputSchema,
    outputSchema: BatchResultSchema,
    annotations: {
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'get_memory',
    title: 'Get Memory',
    description:
      'Retrieve a single memory by its exact SHA-256 hash. Returns the full memory object or E_NOT_FOUND. Use `search_memories` or `recall` when you do not know the exact hash.',
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
      'Full-text search over memory content and tags using FTS5. Returns ranked results with cursor pagination. Query terms are individually matched (all-OR logic; FTS5 phrase operators and negation are not supported). Use `recall` when you need to follow relationships between memories after the search.',
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
      'FTS search with automatic token-budget management. Returns relevance-ranked memories totalling at most `token_budget` tokens. `strategy` controls sort: `relevance` (FTS rank, default), `importance` (highest first), or `recency` (newest first). Returns `truncated: true` when budget was reached before all candidates were included.',
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
      'Search for memories and explore their connections (knowledge graph). FTS search then BFS graph traversal up to `depth` hops. Returns all discovered memories and edges. Use when exploring memory relationships or understanding context. Emits progress per hop. Returns `aborted: true` with partial results when safety limits are hit (env: RECALL_MAX_FRONTIER_SIZE, RECALL_MAX_EDGE_ROWS, RECALL_MAX_VISITED_NODES).',
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
      'Replace the content (and optionally tags) of an existing memory. Returns both old and new SHA-256 hashes, since content changes alter the hash. Returns E_NOT_FOUND if the memory does not exist; E_CONFLICT if the new content+tags already maps to an existing hash.',
    inputSchema: UpdateMemoryInputSchema,
    outputSchema: UpdateResultSchema,
    annotations: { destructiveHint: true, openWorldHint: false },
  },
  {
    name: 'delete_memory',
    title: 'Delete Memory',
    description:
      'Delete a single memory by its SHA-256 hash. Cascade-deletes all relationships involving it. Returns E_NOT_FOUND if the hash does not exist.',
    inputSchema: DeleteMemoryInputSchema,
    outputSchema: DeleteResultSchema,
    annotations: { destructiveHint: true, openWorldHint: false },
  },
  {
    name: 'delete_memories',
    title: 'Delete Memories (Batch)',
    description:
      'Delete up to 50 memories atomically. Cascade-deletes all relationships for each hash. Per-item `deleted: false` means the hash was not found — not an error, the batch still succeeds. Transaction rolls back entirely on unexpected error.',
    inputSchema: DeleteMemoriesInputSchema,
    outputSchema: BatchResultSchema,
    annotations: { destructiveHint: true, openWorldHint: false },
  },
  {
    name: 'create_relationship',
    title: 'Create Relationship',
    description:
      'Create a directed labeled edge between two memories. Idempotent — re-creating an existing relationship is a no-op and returns `created: false`. Both endpoint memories must already exist, otherwise returns E_NOT_FOUND for the missing endpoint.',
    inputSchema: CreateRelationshipInputSchema,
    outputSchema: CreateRelationshipResultSchema,
    annotations: {
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'delete_relationship',
    title: 'Delete Relationship',
    description:
      'Remove a single directed relationship edge between two memories. All three fields (from_hash, to_hash, relation_type) must match exactly. Returns E_NOT_FOUND if the exact relationship does not exist.',
    inputSchema: DeleteRelationshipInputSchema,
    outputSchema: DeleteRelationshipResultSchema,
    annotations: { destructiveHint: true, openWorldHint: false },
  },
  {
    name: 'get_relationships',
    title: 'Get Relationships',
    description:
      'Retrieve all relationships for a memory, with the related memory inlined. Filter by direction (outgoing | incoming | both). Returns E_NOT_FOUND if the source memory does not exist.',
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
      'Return aggregate statistics: total memories, total relationships, oldest/newest timestamps, average importance, and per-type counts. No input required.',
    inputSchema: MemoryStatsInputSchema,
    outputSchema: StatsResultSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
];

export function getToolContracts(): ToolContract[] {
  return TOOL_CONTRACTS;
}

export function getToolContract(name: string): ToolContract {
  const contract = TOOL_CONTRACTS.find((c) => c.name === name);
  if (!contract) {
    throw new Error(`Tool contract not found: ${name}`);
  }
  return contract;
}
