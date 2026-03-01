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

type ToolAnnotations = ToolContract['annotations'];

type ToolDefinition = Omit<ToolContract, 'annotations'> & {
  annotations?: Partial<ToolAnnotations>;
};

const DEFAULT_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  idempotentHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

const READ_ONLY_ANNOTATIONS: Partial<ToolAnnotations> = {
  readOnlyHint: true,
};

const IDEMPOTENT_ANNOTATIONS: Partial<ToolAnnotations> = {
  idempotentHint: true,
};

const DESTRUCTIVE_ANNOTATIONS: Partial<ToolAnnotations> = {
  destructiveHint: true,
};

function createToolContract(definition: ToolDefinition): ToolContract {
  const { annotations, ...rest } = definition;
  return {
    ...rest,
    annotations: {
      ...DEFAULT_ANNOTATIONS,
      ...annotations,
    },
  };
}

function combineAnnotations(
  ...annotations: Partial<ToolAnnotations>[]
): Partial<ToolAnnotations> {
  const merged: Partial<ToolAnnotations> = {};
  for (const annotation of annotations) {
    Object.assign(merged, annotation);
  }
  return merged;
}

const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'store_memory',
    title: 'Store Memory',
    description:
      'Store single memory. Returns hash. Idempotent (created: false if exists). Prefer store_memories.',
    inputSchema: StoreMemoryInputSchema,
    outputSchema: StoreResultSchema,
    annotations: IDEMPOTENT_ANNOTATIONS,
  },
  {
    name: 'store_memories',
    title: 'Store Memories (Batch)',
    description:
      'Store 1-50 memories atomically. Idempotent. Rolls back on error.',
    inputSchema: StoreMemoriesInputSchema,
    outputSchema: BatchResultSchema,
    annotations: IDEMPOTENT_ANNOTATIONS,
  },
  {
    name: 'get_memory',
    title: 'Get Memory',
    description:
      'Retrieve memory by SHA-256 hash. Returns E_NOT_FOUND if missing.',
    inputSchema: GetMemoryInputSchema,
    outputSchema: MemoryResultSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'search_memories',
    title: 'Search Memories',
    description:
      'Full-text search (content+tags). Ranked, paginated. Alphanumeric/underscore only. Implicit AND.',
    inputSchema: SearchMemoriesInputSchema,
    outputSchema: SearchResultSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'retrieve_context',
    title: 'Retrieve Context',
    description:
      'FTS search within token budget. Sorts by relevance/importance/recency. Supports importance and type filters. Returns truncated: true if limit hit.',
    inputSchema: RetrieveContextInputSchema,
    outputSchema: RetrieveContextResultSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'recall',
    title: 'Recall (BFS Graph Traversal)',
    description:
      'FTS search + BFS traversal (depth hops). Returns memories+edges. Emits progress. Aborts on limit.',
    inputSchema: RecallInputSchema,
    outputSchema: RecallResultSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'update_memory',
    title: 'Update Memory',
    description:
      'Update content and/or tags (at least one required). Returns old+new hash. Cascade updates relationships.',
    inputSchema: UpdateMemoryInputSchema,
    outputSchema: UpdateResultSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
  },
  {
    name: 'delete_memory',
    title: 'Delete Memory',
    description:
      'Delete memory by hash. Cascade deletes relationships. Idempotent.',
    inputSchema: DeleteMemoryInputSchema,
    outputSchema: DeleteResultSchema,
    annotations: combineAnnotations(
      DESTRUCTIVE_ANNOTATIONS,
      IDEMPOTENT_ANNOTATIONS
    ),
  },
  {
    name: 'delete_memories',
    title: 'Delete Memories (Batch)',
    description:
      'Delete 1-50 memories atomically. Cascade deletes. Rolls back on error.',
    inputSchema: DeleteMemoriesInputSchema,
    outputSchema: BatchResultSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
  },
  {
    name: 'create_relationship',
    title: 'Create Relationship',
    description:
      'Create directed edge. Idempotent. Errors if endpoints missing.',
    inputSchema: CreateRelationshipInputSchema,
    outputSchema: CreateRelationshipResultSchema,
    annotations: IDEMPOTENT_ANNOTATIONS,
  },
  {
    name: 'delete_relationship',
    title: 'Delete Relationship',
    description: 'Delete edge. Exact match required. Errors if missing.',
    inputSchema: DeleteRelationshipInputSchema,
    outputSchema: DeleteRelationshipResultSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
  },
  {
    name: 'get_relationships',
    title: 'Get Relationships',
    description:
      'Get relationships for memory. Filter direction. Inlines related memory.',
    inputSchema: GetRelationshipsInputSchema,
    outputSchema: RelationshipResultSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'memory_stats',
    title: 'Memory Stats',
    description: 'Get global stats: counts, timestamps, importance.',
    inputSchema: MemoryStatsInputSchema,
    outputSchema: StatsResultSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  },
];

export const TOOL_CONTRACTS: ToolContract[] =
  TOOL_DEFINITIONS.map(createToolContract);

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
