import { z } from 'zod/v4';

export type JsonSchemaObject = Record<string, unknown>;

const JsonSchemaPayloadSchema = z
  .object({
    properties: z
      .record(z.string(), z.record(z.string(), z.unknown()))
      .optional(),
    required: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());

export function extractJsonSchema(schema: z.ZodType): JsonSchemaObject {
  try {
    const raw = z.toJSONSchema(schema);
    return raw as JsonSchemaObject;
  } catch {
    return {};
  }
}

export interface SchemaMeta {
  properties: Record<string, JsonSchemaObject>;
  requiredFields: Set<string>;
}

export function getSchemaMeta(schema: z.ZodType): SchemaMeta {
  const jsonSchema = extractJsonSchema(schema);
  const parsed = JsonSchemaPayloadSchema.safeParse(jsonSchema);
  const data = parsed.success ? parsed.data : {};

  return {
    properties: data.properties ?? {},
    requiredFields: new Set(data.required ?? []),
  };
}
