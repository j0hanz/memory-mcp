import { z } from 'zod/v4';

const STRING_SCHEMA = z.string();
const NUMBER_SCHEMA = z.number();
const BOOLEAN_SCHEMA = z.boolean();

export const ErrorResultSchema = z.strictObject({
  code: STRING_SCHEMA,
  message: STRING_SCHEMA,
});

export const MemorySchema = z.strictObject({
  hash: STRING_SCHEMA,
  content: STRING_SCHEMA,
  tags: z.array(STRING_SCHEMA),
  memory_type: STRING_SCHEMA,
  importance: NUMBER_SCHEMA,
  created_at: STRING_SCHEMA,
  updated_at: STRING_SCHEMA,
  relevance: NUMBER_SCHEMA.optional(),
});

export const MemoryResultSchema = MemorySchema;

export const StoreResultSchema = z.strictObject({
  hash: STRING_SCHEMA,
  created: BOOLEAN_SCHEMA,
});

export const UpdateResultSchema = z.strictObject({
  old_hash: STRING_SCHEMA,
  new_hash: STRING_SCHEMA,
});

export const DeleteResultSchema = z.strictObject({
  hash: STRING_SCHEMA,
  deleted: BOOLEAN_SCHEMA,
});

export const BatchItemResultSchema = z.strictObject({
  hash: STRING_SCHEMA,
  ok: BOOLEAN_SCHEMA,
  created: BOOLEAN_SCHEMA.optional(),
  deleted: BOOLEAN_SCHEMA.optional(),
  error: STRING_SCHEMA.optional(),
});

export const BatchResultSchema = z.strictObject({
  items: z.array(BatchItemResultSchema),
  succeeded: z.number(),
  failed: z.number(),
});

export const SearchResultSchema = z.strictObject({
  memories: z.array(MemorySchema),
  nextCursor: z.string().optional(),
  total_returned: z.number(),
});

export const RelationshipEdgeSchema = z.strictObject({
  from_hash: z.string(),
  to_hash: z.string(),
  relation_type: z.string(),
});

export const RelationshipWithMemorySchema = z.strictObject({
  from_hash: z.string(),
  to_hash: z.string(),
  relation_type: z.string(),
  created_at: z.string(),
  linked_hash: z.string(),
  linked_content: z.string(),
  linked_tags: z.array(z.string()),
});

export const RelationshipResultSchema = z.strictObject({
  relationships: z.array(RelationshipWithMemorySchema),
  count: z.number(),
});

export const CreateRelationshipResultSchema = z.strictObject({
  created: z.boolean(),
});

export const DeleteRelationshipResultSchema = z.strictObject({
  deleted: z.boolean(),
});

export const StatsResultSchema = z.strictObject({
  memories: z.strictObject({
    total: NUMBER_SCHEMA,
    oldest: STRING_SCHEMA.nullable(),
    newest: STRING_SCHEMA.nullable(),
    avg_importance: NUMBER_SCHEMA.nullable(),
  }),
  relationships: z.strictObject({
    total: NUMBER_SCHEMA,
  }),
  by_type: z.record(STRING_SCHEMA, NUMBER_SCHEMA),
});

export const RecallResultSchema = z.strictObject({
  memories: z.array(MemorySchema),
  graph: z.array(RelationshipEdgeSchema),
  depth_reached: NUMBER_SCHEMA,
  aborted: BOOLEAN_SCHEMA.optional(),
  nextCursor: STRING_SCHEMA.optional(),
});

export const RetrieveContextResultSchema = z.strictObject({
  memories: z.array(MemorySchema),
  estimated_tokens: NUMBER_SCHEMA,
  truncated: BOOLEAN_SCHEMA,
});
