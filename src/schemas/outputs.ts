import { z } from 'zod/v4';

export const ErrorResultSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

const OK_SCHEMA = z.boolean();
const OPTIONAL_ERROR_SCHEMA = ErrorResultSchema.optional();

function createOutputSchema<T extends z.ZodType>(
  result: T
): z.ZodObject<{
  ok: typeof OK_SCHEMA;
  result: z.ZodOptional<T>;
  error: typeof OPTIONAL_ERROR_SCHEMA;
}> {
  return z.strictObject({
    ok: OK_SCHEMA,
    result: result.optional(),
    error: OPTIONAL_ERROR_SCHEMA,
  });
}

export const DefaultOutputSchema = createOutputSchema(z.unknown());

export const MemorySchema = z.strictObject({
  hash: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  memory_type: z.string(),
  importance: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  relevance: z.number().optional(),
});

export const MemoryResultSchema = createOutputSchema(MemorySchema);

export const StoreResultSchema = createOutputSchema(
  z.strictObject({
    hash: z.string(),
    created: z.boolean(),
  })
);

export const UpdateResultSchema = createOutputSchema(
  z.strictObject({
    old_hash: z.string(),
    new_hash: z.string(),
  })
);

export const DeleteResultSchema = createOutputSchema(
  z.strictObject({
    hash: z.string(),
    deleted: z.boolean(),
  })
);

export const BatchItemResultSchema = z.strictObject({
  hash: z.string(),
  ok: z.boolean(),
  created: z.boolean().optional(),
  deleted: z.boolean().optional(),
  error: z.string().optional(),
});

export const BatchResultSchema = createOutputSchema(
  z.strictObject({
    items: z.array(BatchItemResultSchema),
    succeeded: z.number(),
    failed: z.number(),
  })
);

export const SearchResultSchema = createOutputSchema(
  z.strictObject({
    memories: z.array(MemorySchema),
    nextCursor: z.string().optional(),
    total_returned: z.number(),
  })
);

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

export const RelationshipResultSchema = createOutputSchema(
  z.strictObject({
    relationships: z.array(RelationshipWithMemorySchema),
    count: z.number(),
  })
);

export const CreateRelationshipResultSchema = createOutputSchema(
  z.strictObject({
    created: z.boolean(),
  })
);

export const DeleteRelationshipResultSchema = createOutputSchema(
  z.strictObject({
    deleted: z.boolean(),
  })
);

export const StatsResultSchema = createOutputSchema(
  z.strictObject({
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
);

export const RecallResultSchema = createOutputSchema(
  z.strictObject({
    memories: z.array(MemorySchema),
    graph: z.array(RelationshipEdgeSchema),
    depth_reached: z.number(),
    aborted: z.boolean().optional(),
    nextCursor: z.string().optional(),
  })
);
