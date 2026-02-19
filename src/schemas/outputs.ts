import { z } from 'zod/v4';

const STRING_SCHEMA = z.string();
const NUMBER_SCHEMA = z.number();

export const ErrorResultSchema = z.strictObject({
  code: STRING_SCHEMA,
  message: STRING_SCHEMA,
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
  const optionalResult = result.optional();
  return z.strictObject({
    ok: OK_SCHEMA,
    result: optionalResult,
    error: OPTIONAL_ERROR_SCHEMA,
  });
}

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

export const RetrieveContextResultSchema = createOutputSchema(
  z.strictObject({
    memories: z.array(MemorySchema),
    estimated_tokens: z.number(),
    truncated: z.boolean(),
  })
);
