import type { z } from 'zod/v4';

import { getSchemaMeta } from '../lib/json-schema.js';
import { getToolContracts } from '../lib/tool-contracts.js';
import { buildCoreContextPack } from './tool-info.js';

function extractOptionalParams(toolName: string, schema: z.ZodType): string[] {
  const { properties, requiredFields } = getSchemaMeta(schema);

  const rows: string[] = [];
  for (const [name, prop] of Object.entries(properties).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (requiredFields.has(name)) continue;
    const desc =
      typeof prop['description'] === 'string' ? prop['description'] : '';
    const rawDefault = prop['default'];
    const defaultVal =
      rawDefault !== undefined ? JSON.stringify(rawDefault) : '—';
    rows.push(`| \`${toolName}\` | \`${name}\` | ${defaultVal} | ${desc} |`);
  }
  return rows;
}

const CROSS_TOOL_DATA_FLOW = `store_memory.hash ──→ get_memory.hash
store_memory.hash ──→ create_relationship.from_hash / to_hash
store_memory.hash ──→ update_memory.hash
store_memory.hash ──→ delete_memory.hash
store_memories.items[].hash ──→ get_memory.hash
search_memories.memories[].hash ──→ get_memory.hash
search_memories.nextCursor ──→ search_memories.cursor
recall.memories[].hash ──→ get_memory.hash
recall.nextCursor ──→ recall.cursor
update_memory.new_hash ──→ get_memory.hash
get_relationships.relationships[].linked_hash ──→ get_memory.hash`;

export function buildToolCatalog(): string {
  const contracts = getToolContracts();
  const optionalRows = contracts.flatMap((c) =>
    extractOptionalParams(c.name, c.inputSchema)
  );

  const optionalParamSection =
    optionalRows.length > 0
      ? [
          '<optional_params>',
          '| Tool | Parameter | Default | Purpose |',
          '|------|-----------|---------|---------|',
          ...optionalRows,
          '</optional_params>',
        ].join('\n')
      : '';

  return [
    buildCoreContextPack(),
    '',
    optionalParamSection,
    '',
    '<data_flow>',
    CROSS_TOOL_DATA_FLOW,
    '</data_flow>',
  ].join('\n');
}
