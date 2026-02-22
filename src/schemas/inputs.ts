import { z } from 'zod/v4';

export const HASH_SCHEMA = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/, {
    error: 'Must be a valid SHA-256 hash (64 lowercase hex chars)',
  })
  .describe('SHA-256 hash (64 hex chars)');

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
  .describe('Tags to categorize the memory');

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
  .describe('Category type for the memory');

const CONTENT_SCHEMA = z
  .string()
  .min(1, { error: 'Content must not be empty' })
  .max(100000, { error: 'Content must be at most 100000 characters' })
  .describe('The content of the memory');

const SEARCH_QUERY_SCHEMA = z
  .string()
  .min(1, { error: 'Query must not be empty' })
  .max(1000, { error: 'Query must be at most 1000 characters' });
const CURSOR_SCHEMA = z
  .string()
  .max(2048, { error: 'Cursor must be at most 2048 characters' });
const CURSOR_DESCRIPTION = 'Pagination cursor from previous response';

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
    `Relationship type (free-form string). Suggested: ${SUGGESTED_RELATION_TYPES.join(', ')}`
  );

const IMPORTANCE_SCHEMA = z
  .int()
  .min(0)
  .max(10)
  .describe('Priority level 0-10 (0=lowest, 10=critical)');
const IMPORTANCE_FILTER_SCHEMA = z.int().min(0).max(10).optional();
const SEARCH_MIN_IMPORTANCE_DESCRIPTION =
  'Filter: only return memories with importance >= this value';
const SEARCH_MAX_IMPORTANCE_DESCRIPTION =
  'Filter: only return memories with importance <= this value';
const SEARCH_MEMORY_TYPE_DESCRIPTION =
  'Filter: only return memories of this type';
const RECALL_MIN_IMPORTANCE_DESCRIPTION =
  'Filter: only seed memories with importance >= this value';
const RECALL_MAX_IMPORTANCE_DESCRIPTION =
  'Filter: only seed memories with importance <= this value';
const RECALL_MEMORY_TYPE_DESCRIPTION =
  'Filter: only seed memories of this type';

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
  .describe('Input for storing a single memory');

export const StoreMemoryItemInputSchema = z
  .strictObject({
    ...STORE_MEMORY_SHAPE,
  })
  .describe('A single memory item to store in a batch');

export const StoreMemoriesInputSchema = z
  .strictObject({
    items: z
      .array(StoreMemoryItemInputSchema)
      .min(1, { error: 'At least one item is required' })
      .max(50, { error: 'Maximum 50 items per batch' })
      .describe('Memories to store (1-50 items)'),
  })
  .describe('Input for storing multiple memories atomically');

export const GetMemoryInputSchema = z
  .strictObject({
    hash: HASH_SCHEMA,
  })
  .describe('Input for retrieving a single memory by hash');

export const UpdateMemoryInputSchema = z
  .strictObject({
    hash: HASH_SCHEMA,
    content: CONTENT_SCHEMA,
    tags: TAGS_ARRAY_SCHEMA.optional(),
  })
  .describe('Input for updating an existing memory');

export const DeleteMemoryInputSchema = z
  .strictObject({
    hash: HASH_SCHEMA,
  })
  .describe('Input for deleting a single memory by hash');

export const DeleteMemoriesInputSchema = z
  .strictObject({
    hashes: z
      .array(HASH_SCHEMA)
      .min(1, { error: 'At least one hash is required' })
      .max(50, { error: 'Maximum 50 hashes per batch' })
      .describe('Hashes of memories to delete (1-50 hashes)'),
  })
  .describe('Input for deleting multiple memories atomically');

export const SearchMemoriesInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe(
      'Search query (searches content and tags)'
    ),
    limit: z
      .int()
      .min(1)
      .max(100)
      .optional()
      .prefault(20)
      .describe('Maximum number of results to return (default 20)'),
    cursor: CURSOR_SCHEMA.optional().describe(CURSOR_DESCRIPTION),
    min_importance: describeImportanceFilter(SEARCH_MIN_IMPORTANCE_DESCRIPTION),
    max_importance: describeImportanceFilter(SEARCH_MAX_IMPORTANCE_DESCRIPTION),
    memory_type: MEMORY_TYPE_SCHEMA.optional().describe(
      SEARCH_MEMORY_TYPE_DESCRIPTION
    ),
  })
  .describe('Input for searching memories using full-text search');

export const RecallInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe(
      'Search query to find initial memories'
    ),
    depth: z
      .int()
      .min(0)
      .max(3)
      .optional()
      .prefault(1)
      .describe('How many relationship hops to follow (0-3)'),
    limit: z
      .int()
      .min(1)
      .max(50)
      .optional()
      .prefault(10)
      .describe('Maximum seed memories to retrieve (default 10)'),
    cursor: CURSOR_SCHEMA.optional().describe(CURSOR_DESCRIPTION),
    min_importance: describeImportanceFilter(RECALL_MIN_IMPORTANCE_DESCRIPTION),
    max_importance: describeImportanceFilter(RECALL_MAX_IMPORTANCE_DESCRIPTION),
    memory_type: MEMORY_TYPE_SCHEMA.optional().describe(
      RECALL_MEMORY_TYPE_DESCRIPTION
    ),
  })
  .describe('Input for exploring memory relationships via graph traversal');

export const RetrieveContextInputSchema = z
  .strictObject({
    query: SEARCH_QUERY_SCHEMA.describe(
      'Search query to find relevant memories'
    ),
    token_budget: z
      .int()
      .min(100)
      .max(200000)
      .optional()
      .prefault(4000)
      .describe('Maximum estimated tokens to return (default 4000)'),
    strategy: z
      .enum(['importance', 'recency', 'relevance'])
      .optional()
      .prefault('relevance')
      .describe(
        'Sort strategy: relevance (FTS rank, default), importance (highest first), recency (newest first)'
      ),
  })
  .describe('Input for retrieving context within a token budget');

export const GetRelationshipsInputSchema = z
  .strictObject({
    hash: HASH_SCHEMA,
    direction: z
      .enum(['outgoing', 'incoming', 'both'])
      .optional()
      .prefault('both')
      .describe('Direction of relationships to retrieve'),
  })
  .describe('Input for retrieving relationships for a specific memory');

export const CreateRelationshipInputSchema = z
  .strictObject({
    from_hash: HASH_SCHEMA.describe('Source memory hash'),
    to_hash: HASH_SCHEMA.describe('Target memory hash'),
    relation_type: RELATION_TYPE_SCHEMA.describe(
      'Type of relationship (e.g. related_to, causes, depends_on)'
    ),
  })
  .describe('Input for creating a directed relationship between two memories');

export const DeleteRelationshipInputSchema = z
  .strictObject({
    from_hash: HASH_SCHEMA.describe('Source memory hash'),
    to_hash: HASH_SCHEMA.describe('Target memory hash'),
    relation_type: RELATION_TYPE_SCHEMA.describe(
      'Type of relationship to delete'
    ),
  })
  .describe('Input for deleting a specific relationship between two memories');

export const MemoryStatsInputSchema = z
  .strictObject({})
  .describe('Input for retrieving memory statistics');
