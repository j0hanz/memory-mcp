import { z } from 'zod/v4';

const STRING_SCHEMA = z.string();
const NUMBER_SCHEMA = z.number();
const BOOLEAN_SCHEMA = z.boolean();
const STRING_ARRAY_SCHEMA = z.array(STRING_SCHEMA);

const RELATIONSHIP_FIELDS = {
  from_hash: STRING_SCHEMA.describe('Source hash'),
  to_hash: STRING_SCHEMA.describe('Target hash'),
  relation_type: STRING_SCHEMA.describe('Relationship type'),
};

export const ErrorResultSchema = z
  .strictObject({
    code: STRING_SCHEMA.describe('Error code'),
    message: STRING_SCHEMA.describe('Error message'),
  })
  .describe('Standard error response');

export const MemorySchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash'),
    content: STRING_SCHEMA.describe('Memory content'),
    tags: STRING_ARRAY_SCHEMA.describe('Memory tags'),
    memory_type: STRING_SCHEMA.describe('Memory type'),
    importance: NUMBER_SCHEMA.describe('Importance (0-10)'),
    created_at: STRING_SCHEMA.describe('Created at'),
    updated_at: STRING_SCHEMA.describe('Updated at'),
    relevance: NUMBER_SCHEMA.optional().describe('Relevance score'),
  })
  .describe('Memory object');

export const MemoryResultSchema = MemorySchema;

export const StoreResultSchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash'),
    created: BOOLEAN_SCHEMA.describe('True if created, false if existed'),
  })
  .describe('Store memory result');

export const UpdateResultSchema = z
  .strictObject({
    old_hash: STRING_SCHEMA.describe('Previous SHA-256 hash'),
    new_hash: STRING_SCHEMA.describe('New SHA-256 hash'),
  })
  .describe('Update memory result');

export const DeleteResultSchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash'),
    deleted: BOOLEAN_SCHEMA.describe('True if deleted, false if not found'),
  })
  .describe('Delete memory result');

export const BatchItemResultSchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash'),
    ok: BOOLEAN_SCHEMA.describe('True if succeeded'),
    created: BOOLEAN_SCHEMA.optional().describe('True if created'),
    deleted: BOOLEAN_SCHEMA.optional().describe('True if deleted'),
    error: STRING_SCHEMA.optional().describe('Error message if failed'),
  })
  .describe('Batch item result');

export const BatchResultSchema = z
  .strictObject({
    items: z.array(BatchItemResultSchema).describe('Item results'),
    succeeded: z.number().describe('Success count'),
    failed: z.number().describe('Failure count'),
  })
  .describe('Batch operation result');

export const SearchResultSchema = z
  .strictObject({
    memories: z.array(MemorySchema).describe('Matching memories'),
    nextCursor: z.string().optional().describe('Next page cursor'),
    total_returned: z.number().describe('Returned count'),
  })
  .describe('Search result');

export const RelationshipEdgeSchema = z
  .strictObject({
    ...RELATIONSHIP_FIELDS,
  })
  .describe('Relationship edge');

export const RelationshipWithMemorySchema = z
  .strictObject({
    ...RELATIONSHIP_FIELDS,
    created_at: z.string().describe('Created at'),
    linked_hash: z.string().describe('Linked memory hash'),
    linked_content: z.string().describe('Linked memory content'),
    linked_tags: STRING_ARRAY_SCHEMA.describe('Linked memory tags'),
  })
  .describe('Relationship edge with linked memory');

export const RelationshipResultSchema = z
  .strictObject({
    relationships: z
      .array(RelationshipWithMemorySchema)
      .describe('List of relationships'),
    count: z.number().describe('Number of relationships returned'),
  })
  .describe('Result of retrieving relationships');

export const CreateRelationshipResultSchema = z
  .strictObject({
    created: z.boolean().describe('True if created, false if existed'),
  })
  .describe('Create relationship result');

export const DeleteRelationshipResultSchema = z
  .strictObject({
    deleted: z.boolean().describe('True if deleted, false if not found'),
  })
  .describe('Delete relationship result');

export const StatsResultSchema = z
  .strictObject({
    memories: z
      .strictObject({
        total: NUMBER_SCHEMA.describe('Total memories'),
        oldest: STRING_SCHEMA.nullable().describe('Oldest timestamp'),
        newest: STRING_SCHEMA.nullable().describe('Newest timestamp'),
        avg_importance: NUMBER_SCHEMA.nullable().describe('Average importance'),
      })
      .describe('Memory stats'),
    relationships: z
      .strictObject({
        total: NUMBER_SCHEMA.describe('Total relationships'),
      })
      .describe('Relationship stats'),
    by_type: z.record(STRING_SCHEMA, NUMBER_SCHEMA).describe('Count by type'),
  })
  .describe('Memory statistics result');

export const RecallResultSchema = z
  .strictObject({
    memories: z.array(MemorySchema).describe('Discovered memories'),
    graph: z.array(RelationshipEdgeSchema).describe('Discovered edges'),
    depth_reached: NUMBER_SCHEMA.describe('Max depth reached'),
    aborted: BOOLEAN_SCHEMA.optional().describe('True if aborted by limits'),
    nextCursor: STRING_SCHEMA.optional().describe('Next page cursor'),
  })
  .describe('Recall result');

export const RetrieveContextResultSchema = z
  .strictObject({
    memories: z.array(MemorySchema).describe('Relevant memories'),
    estimated_tokens: NUMBER_SCHEMA.describe('Estimated tokens'),
    truncated: BOOLEAN_SCHEMA.describe('True if truncated by budget'),
  })
  .describe('Retrieve context result');
