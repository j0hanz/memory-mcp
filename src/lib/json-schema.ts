import { z } from 'zod/v4';

export type JsonSchemaObject = Record<string, unknown>;

export function extractJsonSchema(schema: z.ZodType): JsonSchemaObject {
  try {
    return z.toJSONSchema(schema) as JsonSchemaObject;
  } catch {
    return {};
  }
}
