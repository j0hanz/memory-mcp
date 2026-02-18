import { z } from 'zod/v4';

export const ErrorResultSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

export const DefaultOutputSchema = z.strictObject({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: ErrorResultSchema.optional(),
});

export const MemorySchema = z.strictObject({
  hash: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  memory_type: z.string(),
  importance: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const MemoryResultSchema = z.strictObject({
  ok: z.boolean(),
  result: MemorySchema.optional(),
  error: ErrorResultSchema.optional(),
});

export const StoreResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      hash: z.string(),
      created: z.boolean(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const UpdateResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      old_hash: z.string(),
      new_hash: z.string(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const DeleteResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      hash: z.string(),
      deleted: z.boolean(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const BatchItemResultSchema = z.strictObject({
  hash: z.string(),
  ok: z.boolean(),
  created: z.boolean().optional(),
  deleted: z.boolean().optional(),
  error: z.string().optional(),
});

export const BatchResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      items: z.array(BatchItemResultSchema),
      succeeded: z.number(),
      failed: z.number(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const SearchResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      memories: z.array(MemorySchema),
      nextCursor: z.string().optional(),
      total_returned: z.number(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
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
  ok: z.boolean(),
  result: z
    .strictObject({
      relationships: z.array(RelationshipWithMemorySchema),
      count: z.number(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const CreateRelationshipResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      created: z.boolean(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const DeleteRelationshipResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      deleted: z.boolean(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const StatsResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      memories: z.strictObject({
        total: z.number(),
        oldest: z.string().nullable(),
        newest: z.string().nullable(),
        avg_importance: z.number().nullable(),
      }),
      relationships: z.strictObject({
        total: z.number(),
      }),
      by_type: z.record(z.string(), z.number()),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});

export const RecallResultSchema = z.strictObject({
  ok: z.boolean(),
  result: z
    .strictObject({
      memories: z.array(MemorySchema),
      graph: z.array(RelationshipEdgeSchema),
      depth_reached: z.number(),
      aborted: z.boolean().optional(),
      nextCursor: z.string().optional(),
    })
    .optional(),
  error: ErrorResultSchema.optional(),
});
