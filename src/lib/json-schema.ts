import { z } from 'zod/v4';

export type JsonSchemaObject = Record<string, unknown>;

export function extractJsonSchema(schema: z.ZodType): JsonSchemaObject {
  try {
    return z.toJSONSchema(schema) as JsonSchemaObject;
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
  return {
    properties: (jsonSchema['properties'] ?? {}) as Record<
      string,
      JsonSchemaObject
    >,
    requiredFields: new Set(
      Array.isArray(jsonSchema['required'])
        ? (jsonSchema['required'] as string[])
        : []
    ),
  };
}
