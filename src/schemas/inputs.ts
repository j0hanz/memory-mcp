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

function describeImportanceFilter(
  description: string
): z.ZodOptional<z.ZodNumber> {
  return IMPORTANCE_FILTER_SCHEMA.clone().describe(description);
}

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
    hash: HASH_SCHEMA,
  })
  .describe('Get memory by hash');

export const UpdateMemoryInputSchema = z
  .strictObject({
    hash: HASH_SCHEMA,
    content: CONTENT_SCHEMA,
    tags: TAGS_ARRAY_SCHEMA.optional(),
  })
  .describe('Update memory');

export const DeleteMemoryInputSchema = z
  .strictObject({
    hash: HASH_SCHEMA,
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

export const SearchMemoriesInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe('Search query'),
    limit: z
      .int()
      .min(1)
      .max(100)
      .optional()
      .prefault(20)
      .describe('Max results (default 20)'),
    cursor: CURSOR_SCHEMA.optional().describe(CURSOR_DESCRIPTION),
    min_importance: describeImportanceFilter(SEARCH_MIN_IMPORTANCE_DESCRIPTION),
    max_importance: describeImportanceFilter(SEARCH_MAX_IMPORTANCE_DESCRIPTION),
    memory_type: MEMORY_TYPE_SCHEMA.optional().describe(
      SEARCH_MEMORY_TYPE_DESCRIPTION
    ),
  })
  .describe('Search memories');

export const RecallInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe('Search query'),
    depth: z
      .int()
      .min(0)
      .max(3)
      .optional()
      .prefault(1)
      .describe('Relationship hops (0-3)'),
    limit: z
      .int()
      .min(1)
      .max(50)
      .optional()
      .prefault(10)
      .describe('Max seed memories (default 10)'),
    cursor: CURSOR_SCHEMA.optional().describe(CURSOR_DESCRIPTION),
    min_importance: describeImportanceFilter(RECALL_MIN_IMPORTANCE_DESCRIPTION),
    max_importance: describeImportanceFilter(RECALL_MAX_IMPORTANCE_DESCRIPTION),
    memory_type: MEMORY_TYPE_SCHEMA.optional().describe(
      RECALL_MEMORY_TYPE_DESCRIPTION
    ),
  })
  .describe('Recall memories via graph traversal');

export const RetrieveContextInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe('Search query'),
    token_budget: z
      .int()
      .min(100)
      .max(200000)
      .optional()
      .prefault(4000)
      .describe('Max tokens (default 4000)'),
    strategy: z
      .enum(['importance', 'recency', 'relevance'])
      .optional()
      .prefault('relevance')
      .describe('Sort strategy'),
  })
  .describe('Retrieve context within token budget');

export const GetRelationshipsInputSchema = z
  .strictObject({
    hash: HASH_SCHEMA,
    direction: z
      .enum(['outgoing', 'incoming', 'both'])
      .optional()
      .prefault('both')
      .describe('Direction filter'),
  })
  .describe('Get relationships');

export const CreateRelationshipInputSchema = z
  .strictObject({
    from_hash: HASH_SCHEMA.describe('Source hash'),
    to_hash: HASH_SCHEMA.describe('Target hash'),
    relation_type: RELATION_TYPE_SCHEMA.describe('Relationship type'),
  })
  .describe('Create relationship');

export const DeleteRelationshipInputSchema = z
  .strictObject({
    from_hash: HASH_SCHEMA.describe('Source hash'),
    to_hash: HASH_SCHEMA.describe('Target hash'),
    relation_type: RELATION_TYPE_SCHEMA.describe('Relationship type'),
  })
  .describe('Delete relationship');

export const MemoryStatsInputSchema = z
  .strictObject({})
  .describe('Get memory stats');
