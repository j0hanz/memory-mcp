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
      'Store single memory. Returns hash. Idempotent (created: false if exists). Prefer store_memories.',
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
      'Store 1-50 memories atomically. Idempotent. Rolls back on error.',
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
      'Retrieve memory by SHA-256 hash. Returns E_NOT_FOUND if missing.',
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
      'Full-text search (content+tags). Ranked, paginated. Alphanumeric/underscore only. Implicit AND.',
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
      'FTS search within token budget. Sorts by relevance/importance/recency. Returns truncated: true if limit hit.',
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
      'FTS search + BFS traversal (depth hops). Returns memories+edges. Emits progress. Aborts on limit.',
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
      'Update content/tags. Returns old+new hash. Cascade updates relationships.',
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
      'Delete memory by hash. Cascade deletes relationships. Idempotent.',
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
      'Delete 1-50 memories atomically. Cascade deletes. Rolls back on error.',
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
      'Create directed edge. Idempotent. Errors if endpoints missing.',
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
    description: 'Delete edge. Exact match required. Errors if missing.',
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
      'Get relationships for memory. Filter direction. Inlines related memory.',
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
    description: 'Get global stats: counts, timestamps, importance.',
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
