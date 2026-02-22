import { z } from 'zod/v4';

const STRING_SCHEMA = z.string();
const NUMBER_SCHEMA = z.number();
const BOOLEAN_SCHEMA = z.boolean();

export const ErrorResultSchema = z
  .strictObject({
    code: STRING_SCHEMA.describe('Error code'),
    message: STRING_SCHEMA.describe('Error message'),
  })
  .describe('Standard error response');

export const MemorySchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash of the memory'),
    content: STRING_SCHEMA.describe('Content of the memory'),
    tags: z.array(STRING_SCHEMA).describe('Tags associated with the memory'),
    memory_type: STRING_SCHEMA.describe('Type of the memory'),
    importance: NUMBER_SCHEMA.describe('Importance score (0-10)'),
    created_at: STRING_SCHEMA.describe('Creation timestamp'),
    updated_at: STRING_SCHEMA.describe('Last update timestamp'),
    relevance: NUMBER_SCHEMA.optional().describe(
      'Relevance score (if applicable)'
    ),
  })
  .describe('A single memory object');

export const MemoryResultSchema = MemorySchema;

export const StoreResultSchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash of the stored memory'),
    created: BOOLEAN_SCHEMA.describe(
      'True if a new memory was created, false if it already existed'
    ),
  })
  .describe('Result of storing a single memory');

export const UpdateResultSchema = z
  .strictObject({
    old_hash: STRING_SCHEMA.describe('Previous SHA-256 hash'),
    new_hash: STRING_SCHEMA.describe('New SHA-256 hash after update'),
  })
  .describe('Result of updating a memory');

export const DeleteResultSchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash of the deleted memory'),
    deleted: BOOLEAN_SCHEMA.describe(
      'True if the memory was deleted, false if it was not found'
    ),
  })
  .describe('Result of deleting a single memory');

export const BatchItemResultSchema = z
  .strictObject({
    hash: STRING_SCHEMA.describe('SHA-256 hash of the memory'),
    ok: BOOLEAN_SCHEMA.describe(
      'True if the operation succeeded for this item'
    ),
    created: BOOLEAN_SCHEMA.optional().describe(
      'True if a new memory was created'
    ),
    deleted: BOOLEAN_SCHEMA.optional().describe(
      'True if the memory was deleted'
    ),
    error: STRING_SCHEMA.optional().describe(
      'Error message if the operation failed'
    ),
  })
  .describe('Result of a batch operation for a single item');

export const BatchResultSchema = z
  .strictObject({
    items: z
      .array(BatchItemResultSchema)
      .describe('Results for each item in the batch'),
    succeeded: z.number().describe('Number of items that succeeded'),
    failed: z.number().describe('Number of items that failed'),
  })
  .describe('Result of a batch operation');

export const SearchResultSchema = z
  .strictObject({
    memories: z.array(MemorySchema).describe('List of matching memories'),
    nextCursor: z
      .string()
      .optional()
      .describe('Cursor for the next page of results'),
    total_returned: z
      .number()
      .describe('Number of memories returned in this page'),
  })
  .describe('Result of searching memories');

export const RelationshipEdgeSchema = z
  .strictObject({
    from_hash: z.string().describe('Source memory hash'),
    to_hash: z.string().describe('Target memory hash'),
    relation_type: z.string().describe('Type of relationship'),
  })
  .describe('A directed relationship edge between two memories');

export const RelationshipWithMemorySchema = z
  .strictObject({
    from_hash: z.string().describe('Source memory hash'),
    to_hash: z.string().describe('Target memory hash'),
    relation_type: z.string().describe('Type of relationship'),
    created_at: z.string().describe('Creation timestamp of the relationship'),
    linked_hash: z.string().describe('Hash of the linked memory'),
    linked_content: z.string().describe('Content of the linked memory'),
    linked_tags: z.array(z.string()).describe('Tags of the linked memory'),
  })
  .describe('A relationship edge with the linked memory data inlined');

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
    created: z
      .boolean()
      .describe(
        'True if a new relationship was created, false if it already existed'
      ),
  })
  .describe('Result of creating a relationship');

export const DeleteRelationshipResultSchema = z
  .strictObject({
    deleted: z
      .boolean()
      .describe(
        'True if the relationship was deleted, false if it was not found'
      ),
  })
  .describe('Result of deleting a relationship');

export const StatsResultSchema = z
  .strictObject({
    memories: z
      .strictObject({
        total: NUMBER_SCHEMA.describe('Total number of memories'),
        oldest: STRING_SCHEMA.nullable().describe(
          'Timestamp of the oldest memory'
        ),
        newest: STRING_SCHEMA.nullable().describe(
          'Timestamp of the newest memory'
        ),
        avg_importance: NUMBER_SCHEMA.nullable().describe(
          'Average importance score'
        ),
      })
      .describe('Memory statistics'),
    relationships: z
      .strictObject({
        total: NUMBER_SCHEMA.describe('Total number of relationships'),
      })
      .describe('Relationship statistics'),
    by_type: z
      .record(STRING_SCHEMA, NUMBER_SCHEMA)
      .describe('Count of memories by type'),
  })
  .describe('Result of retrieving memory statistics');

export const RecallResultSchema = z
  .strictObject({
    memories: z.array(MemorySchema).describe('List of discovered memories'),
    graph: z
      .array(RelationshipEdgeSchema)
      .describe('List of discovered relationship edges'),
    depth_reached: NUMBER_SCHEMA.describe(
      'Maximum depth reached during traversal'
    ),
    aborted: BOOLEAN_SCHEMA.optional().describe(
      'True if traversal was aborted due to safety limits'
    ),
    nextCursor: STRING_SCHEMA.optional().describe(
      'Cursor for the next page of seed results'
    ),
  })
  .describe('Result of exploring memory relationships via graph traversal');

export const RetrieveContextResultSchema = z
  .strictObject({
    memories: z.array(MemorySchema).describe('List of relevant memories'),
    estimated_tokens: NUMBER_SCHEMA.describe(
      'Estimated total tokens of the returned memories'
    ),
    truncated: BOOLEAN_SCHEMA.describe(
      'True if the results were truncated to fit the token budget'
    ),
  })
  .describe('Result of retrieving context within a token budget');
