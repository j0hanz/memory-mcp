import { z } from 'zod/v4';

import { getToolContracts, type ToolContract } from '../lib/tool-contracts.js';

// --- Shared Constraints (Single Source of Truth) ---

const SHARED_CONSTRAINTS: readonly string[] = [
  'Idempotence: `store_memory` and `store_memories` return `created: false` if content+tags exist.',
  'Atomic Transactions: `store_memories` and `delete_memories` roll back on error.',
  'Hash Changes: `update_memory` changes hash on content/tags change. Relationships survive via CASCADE.',
  'FTS Search Limits: Query is tokenized to alphanumeric/underscore terms and uses implicit AND matching. No phrase/negation support.',
  'Recall Limits: BFS traversal bounded by env vars. Returns `aborted: true` with partial results only when limits are hit.',
];

export function getSharedConstraints(): readonly string[] {
  return SHARED_CONSTRAINTS;
}

// --- Core Context Pack ---

interface ToolEntry {
  name: string;
  purpose: string;
  behavior: string;
}

type JsonSchemaObject = Record<string, unknown>;

function formatBehavior(annotations: ToolContract['annotations']): string {
  const hints: string[] = [];
  if (annotations.readOnlyHint === true) hints.push('read-only');
  if (annotations.destructiveHint === true) hints.push('destructive');
  if (annotations.idempotentHint === true) hints.push('idempotent');
  return hints.join(', ') || '—';
}

function toEntry(contract: ToolContract): ToolEntry {
  return {
    name: contract.name,
    purpose: contract.description.split('.')[0] ?? '',
    behavior: formatBehavior(contract.annotations),
  };
}

export function buildCoreContextPack(): string {
  const contracts = getToolContracts();
  const entries = contracts
    .map(toEntry)
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = entries.map(
    (e) => `| \`${e.name}\` | ${e.purpose} | ${e.behavior} |`
  );

  return [
    '# Core Context Pack',
    '',
    '| Tool | Purpose | Behavior |',
    '|------|---------|----------|',
    ...rows,
  ].join('\n');
}

// --- Per-Tool Info ---

function extractJsonSchema(schema: z.ZodType): JsonSchemaObject {
  try {
    return z.toJSONSchema(schema) as JsonSchemaObject;
  } catch {
    return {};
  }
}

function formatParamConstraints(prop: JsonSchemaObject): string {
  const parts: string[] = [];
  if (typeof prop['minimum'] === 'number')
    parts.push(`min: ${prop['minimum']}`);
  if (typeof prop['maximum'] === 'number')
    parts.push(`max: ${prop['maximum']}`);
  if (typeof prop['minLength'] === 'number')
    parts.push(`minLength: ${prop['minLength']}`);
  if (typeof prop['maxLength'] === 'number')
    parts.push(`maxLength: ${prop['maxLength']}`);
  if (typeof prop['minItems'] === 'number')
    parts.push(`minItems: ${prop['minItems']}`);
  if (typeof prop['maxItems'] === 'number')
    parts.push(`maxItems: ${prop['maxItems']}`);
  if (Array.isArray(prop['enum']))
    parts.push(`enum: ${(prop['enum'] as string[]).join(' | ')}`);
  return parts.length > 0 ? `; ${parts.join(', ')}` : '';
}

function formatParam(
  name: string,
  prop: JsonSchemaObject,
  required: boolean
): string {
  const type = typeof prop['type'] === 'string' ? prop['type'] : 'unknown';
  const desc =
    typeof prop['description'] === 'string' ? prop['description'] : '';
  const constraints = formatParamConstraints(prop);
  const reqStr = required ? 'req' : 'opt';
  return `- \`${name}\` (${type}, ${reqStr}): ${desc}${constraints}`;
}

function formatOutputShape(schema: z.ZodType): string {
  const jsonSchema = extractJsonSchema(schema);
  const properties = jsonSchema['properties'] as
    | Record<string, JsonSchemaObject>
    | undefined;
  if (!properties) return '{}';

  const requiredFields = new Set(
    Array.isArray(jsonSchema['required'])
      ? (jsonSchema['required'] as string[])
      : []
  );

  const parts = Object.entries(properties).map(([key, prop]) => {
    const isArray = prop['type'] === 'array';
    const isOptional = !requiredFields.has(key);
    return `${key}${isArray ? '[]' : ''}${isOptional ? '?' : ''}`;
  });

  return `{${parts.join(', ')}}`;
}

export function getToolInfo(name: string): string | undefined {
  const contract = getToolContracts().find((c) => c.name === name);
  if (!contract) return undefined;

  const inputSchema = extractJsonSchema(contract.inputSchema);
  const properties = (inputSchema['properties'] ?? {}) as Record<
    string,
    JsonSchemaObject
  >;
  const requiredFields = new Set(
    Array.isArray(inputSchema['required'])
      ? (inputSchema['required'] as string[])
      : []
  );

  const paramLines = Object.entries(properties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pName, pSchema]) =>
      formatParam(pName, pSchema, requiredFields.has(pName))
    );

  const behaviorLine = formatBehavior(contract.annotations);
  const outputShape = formatOutputShape(contract.outputSchema);

  return [
    `### ${contract.name} (${behaviorLine})`,
    contract.description,
    '',
    '**Params:**',
    paramLines.length > 0 ? paramLines.join('\n') : 'None',
    '',
    `**Output:** \`${outputShape}\``,
  ].join('\n');
}

export function getToolNames(): string[] {
  return getToolContracts()
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
}
