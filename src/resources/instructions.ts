import { getToolContracts } from '../lib/tool-contracts.js';
import { getSharedConstraints } from './tool-info.js';

const PROMPTS_INVENTORY = ['- `get-help` — Full usage instructions.'];

const RESOURCES_INVENTORY = [
  '- `internal://instructions` — This document (routing, errors, workflows).',
  '- `internal://tool-catalog` — Tool reference, parameters, data flow.',
  '- `internal://tool-info/{toolName}` — Tool details (params, behavior, output).',
  '- `internal://workflows` — Multi-step workflow sequences.',
  '- `internal://server-config` — Runtime config, limits, capabilities.',
  '- `memory://memories/{hash}` — Fetch memory by URI.',
];

const ERROR_CODES = [
  '| Code | Meaning |',
  '| --- | --- |',
  '| `E_NOT_FOUND` | Hash or relationship does not exist |',
  '| `E_CONFLICT` | `update_memory` target content+tags already maps to an existing hash |',
  '| `E_CANCELLED` | Request was cancelled |',
  '| `E_UNKNOWN` | Unexpected internal error — retry once |',
];

const ERROR_RESULT_CONVENTIONS = [
  '- Tool failures return `isError: true` with JSON text in `content[0].text`.',
  '- Error payload shape: `{ ok: false, error: { code, message } }`.',
  '- On error, do not expect `structuredContent`; parse the JSON text payload instead.',
  '- Successful responses include both `structuredContent` and JSON text in `content[0].text`.',
];

const DATA_MODEL = `Memory:
- hash: SHA-256(content + sorted tags). Deterministic.
- content: 1-100k chars.
- tags: 1-100 items, 1-50 chars each.
- type: general|fact|plan|decision|reflection|lesson|error|gradient.
- importance: 0-10.

Relationship:
- Edge: from_hash -[relation_type]-> to_hash.
- type: 1-50 chars.
- Constraint: Endpoints must exist. Cascade delete/update.`;

const WORKFLOWS = `
1. Store and Link:
   store_memories({ items: [...] }) -> { items[].hash }
   create_relationship({ from_hash, to_hash, relation_type })

2. Search and Read:
   search_memories({ query, limit }) -> { memories[], nextCursor }
   recall({ query, depth: 1 }) -> { memories[], graph[] }

3. Fill Context:
   retrieve_context({ query, token_budget: 4000 }) -> { memories[], truncated }

4. Update:
   update_memory({ hash, content }) -> { new_hash }

5. Delete:
   delete_memories({ hashes: [...] }) -> { items[].deleted }`;

function buildToolRouting(): string {
  const rows = getToolContracts().map((c) => {
    const purpose = c.description.split('.')[0] ?? '';
    return `| \`${c.name}\` | ${purpose} |`;
  });

  return ['| Tool | Purpose |', '| --- | --- |', ...rows].join('\n');
}

function renderSharedConstraints(): string {
  return getSharedConstraints()
    .map((c) => `- ${c}`)
    .join('\n');
}

export function buildServerInstructions(): string {
  return [
    '<role>',
    'Memory MCP: Persistent memory storage, full-text retrieval, and relationship graph traversal.',
    '</role>',
    '',
    '<capabilities>',
    buildToolRouting(),
    '</capabilities>',
    '',
    '<constraints>',
    renderSharedConstraints(),
    '</constraints>',
    '',
    '<error_codes>',
    ERROR_CODES.join('\n'),
    '</error_codes>',
    '',
    '<error_result_conventions>',
    ERROR_RESULT_CONVENTIONS.join('\n'),
    '</error_result_conventions>',
    '',
    '<data_model>',
    DATA_MODEL,
    '</data_model>',
    '',
    '<workflows>',
    WORKFLOWS,
    '</workflows>',
    '',
    '<prompts>',
    PROMPTS_INVENTORY.join('\n'),
    '</prompts>',
    '',
    '<resources>',
    RESOURCES_INVENTORY.join('\n'),
    '</resources>',
  ].join('\n');
}
