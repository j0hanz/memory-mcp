import { z } from 'zod/v4';

export const HASH_SCHEMA = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/, {
    error: 'Must be a valid SHA-256 hash (64 lowercase hex chars)',
  })
  .describe('SHA-256 hash');

const TAG_SCHEMA = z
  .string()
  .min(1, { error: 'Tag must not be empty' })
  .max(50, { error: 'Tag must be at most 50 characters' })
  .regex(/^\S+$/, { error: 'Tags must not contain whitespace' })
  .describe('Tag (no whitespace, max 50 chars)');

const TAGS_ARRAY_SCHEMA = z
  .array(TAG_SCHEMA)
  .min(1, { error: 'At least one tag is required' })
  .max(100, { error: 'Maximum 100 tags allowed' })
  .describe('Memory tags');

const MEMORY_TYPE_SCHEMA = z
  .enum([
    'general',
    'fact',
    'plan',
    'decision',
    'reflection',
    'lesson',
    'error',
    'gradient',
  ])
  .describe('Memory category');

const CONTENT_SCHEMA = z
  .string()
  .min(1, { error: 'Content must not be empty' })
  .max(100000, { error: 'Content must be at most 100000 characters' })
  .describe('Memory content');

const SEARCH_QUERY_SCHEMA = z
  .string()
  .min(1, { error: 'Query must not be empty' })
  .max(1000, { error: 'Query must be at most 1000 characters' });
const CURSOR_SCHEMA = z
  .string()
  .max(2048, { error: 'Cursor must be at most 2048 characters' });
const CURSOR_DESCRIPTION = 'Pagination cursor';

export const SUGGESTED_RELATION_TYPES = [
  'related_to',
  'causes',
  'depends_on',
  'parent_of',
  'child_of',
  'supersedes',
  'contradicts',
  'supports',
  'references',
] as const;

const RELATION_TYPE_SCHEMA = z
  .string()
  .min(1, { error: 'Relation type must not be empty' })
  .max(50, { error: 'Relation type must be at most 50 characters' })
  .regex(/^\S+$/, { error: 'Relation type must not contain whitespace' })
  .describe(
    `Relationship type. Suggested: ${SUGGESTED_RELATION_TYPES.join(', ')}`
  );

const IMPORTANCE_SCHEMA = z.int().min(0).max(10).describe('Priority (0-10)');
const IMPORTANCE_FILTER_SCHEMA = z.int().min(0).max(10).optional();
const SEARCH_MIN_IMPORTANCE_DESCRIPTION = 'Min importance filter';
const SEARCH_MAX_IMPORTANCE_DESCRIPTION = 'Max importance filter';
const SEARCH_MEMORY_TYPE_DESCRIPTION = 'Memory type filter';
const RECALL_MIN_IMPORTANCE_DESCRIPTION = 'Min importance filter';
const RECALL_MAX_IMPORTANCE_DESCRIPTION = 'Max importance filter';
const RECALL_MEMORY_TYPE_DESCRIPTION = 'Memory type filter';

function describeHash(label: string): typeof HASH_SCHEMA {
  return HASH_SCHEMA.describe(label);
}

function createPrefaultIntField(config: {
  min: number;
  max: number;
  prefault: number;
  description: string;
}): z.ZodPrefault<z.ZodOptional<z.ZodNumber>> {
  return z
    .int()
    .min(config.min)
    .max(config.max)
    .optional()
    .prefault(config.prefault)
    .describe(config.description);
}

function describeImportanceFilter(
  description: string
): z.ZodOptional<z.ZodNumber> {
  return IMPORTANCE_FILTER_SCHEMA.clone().describe(description);
}

function createSearchFilterFields(descriptions: {
  min: string;
  max: string;
  type: string;
}): {
  min_importance: z.ZodOptional<z.ZodNumber>;
  max_importance: z.ZodOptional<z.ZodNumber>;
  memory_type: z.ZodOptional<typeof MEMORY_TYPE_SCHEMA>;
} {
  return {
    min_importance: describeImportanceFilter(descriptions.min),
    max_importance: describeImportanceFilter(descriptions.max),
    memory_type: MEMORY_TYPE_SCHEMA.optional().describe(descriptions.type),
  };
}

const SEARCH_FILTER_FIELDS = createSearchFilterFields({
  min: SEARCH_MIN_IMPORTANCE_DESCRIPTION,
  max: SEARCH_MAX_IMPORTANCE_DESCRIPTION,
  type: SEARCH_MEMORY_TYPE_DESCRIPTION,
});
const RECALL_FILTER_FIELDS = createSearchFilterFields({
  min: RECALL_MIN_IMPORTANCE_DESCRIPTION,
  max: RECALL_MAX_IMPORTANCE_DESCRIPTION,
  type: RECALL_MEMORY_TYPE_DESCRIPTION,
});

const STORE_MEMORY_SHAPE = {
  content: CONTENT_SCHEMA,
  tags: TAGS_ARRAY_SCHEMA,
  memory_type: MEMORY_TYPE_SCHEMA.optional(),
  importance: IMPORTANCE_SCHEMA.optional().prefault(0),
};

export const StoreMemoryInputSchema = z
  .strictObject({
    ...STORE_MEMORY_SHAPE,
  })
  .describe('Store single memory');

export const StoreMemoryItemInputSchema = z
  .strictObject({
    ...STORE_MEMORY_SHAPE,
  })
  .describe('Batch memory item');

export const StoreMemoriesInputSchema = z
  .strictObject({
    items: z
      .array(StoreMemoryItemInputSchema)
      .min(1, { error: 'At least one item is required' })
      .max(50, { error: 'Maximum 50 items per batch' })
      .describe('Memories to store (1-50)'),
  })
  .describe('Store multiple memories');

export const GetMemoryInputSchema = z
  .strictObject({
    hash: describeHash('SHA-256 hash'),
  })
  .describe('Get memory by hash');

export const UpdateMemoryInputSchema = z
  .strictObject({
    hash: describeHash('SHA-256 hash'),
    content: CONTENT_SCHEMA.optional(),
    tags: TAGS_ARRAY_SCHEMA.optional(),
  })
  .refine((data) => data.content !== undefined || data.tags !== undefined, {
    error: 'At least one of content or tags must be provided',
  })
  .describe('Update memory');

export const DeleteMemoryInputSchema = z
  .strictObject({
    hash: describeHash('SHA-256 hash'),
  })
  .describe('Delete memory by hash');

export const DeleteMemoriesInputSchema = z
  .strictObject({
    hashes: z
      .array(HASH_SCHEMA)
      .min(1, { error: 'At least one hash is required' })
      .max(50, { error: 'Maximum 50 hashes per batch' })
      .describe('Hashes to delete (1-50)'),
  })
  .describe('Delete multiple memories');

const RELATIONSHIP_ENDPOINT_FIELDS = {
  from_hash: describeHash('Source hash'),
  to_hash: describeHash('Target hash'),
  relation_type: RELATION_TYPE_SCHEMA.describe('Relationship type'),
};

export const SearchMemoriesInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe('Search query'),
    limit: createPrefaultIntField({
      min: 1,
      max: 100,
      prefault: 20,
      description: 'Max results (default 20)',
    }),
    cursor: CURSOR_SCHEMA.optional().describe(CURSOR_DESCRIPTION),
    ...SEARCH_FILTER_FIELDS,
  })
  .describe('Search memories');

export const RecallInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe('Search query'),
    depth: createPrefaultIntField({
      min: 0,
      max: 3,
      prefault: 1,
      description: 'Relationship hops (0-3)',
    }),
    limit: createPrefaultIntField({
      min: 1,
      max: 50,
      prefault: 10,
      description: 'Max seed memories (default 10)',
    }),
    cursor: CURSOR_SCHEMA.optional().describe(CURSOR_DESCRIPTION),
    ...RECALL_FILTER_FIELDS,
  })
  .describe('Recall memories via graph traversal');

const RETRIEVE_CONTEXT_FILTER_FIELDS = createSearchFilterFields({
  min: 'Min importance filter',
  max: 'Max importance filter',
  type: 'Memory type filter',
});

export const RetrieveContextInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe('Search query'),
    token_budget: createPrefaultIntField({
      min: 100,
      max: 200000,
      prefault: 4000,
      description: 'Max tokens (default 4000)',
    }),
    strategy: z
      .enum(['importance', 'recency', 'relevance'])
      .optional()
      .prefault('relevance')
      .describe('Sort strategy'),
    ...RETRIEVE_CONTEXT_FILTER_FIELDS,
  })
  .describe('Retrieve context within token budget');

export const GetRelationshipsInputSchema = z
  .strictObject({
    hash: describeHash('SHA-256 hash'),
    direction: z
      .enum(['outgoing', 'incoming', 'both'])
      .optional()
      .prefault('both')
      .describe('Direction filter'),
  })
  .describe('Get relationships');

export const CreateRelationshipInputSchema = z
  .strictObject({
    ...RELATIONSHIP_ENDPOINT_FIELDS,
  })
  .describe('Create relationship');

export const DeleteRelationshipInputSchema = z
  .strictObject({
    ...RELATIONSHIP_ENDPOINT_FIELDS,
  })
  .describe('Delete relationship');

export const MemoryStatsInputSchema = z
  .strictObject({})
  .describe('Get memory stats');
