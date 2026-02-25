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

const DATA_MODEL = `### Memory
- \`hash\` — SHA-256 of \`(content + sorted tags)\`; deterministic; changes when content or tags change
- \`content\` — Text; 1–100,000 chars
- \`tags\` — Array; 1–100 tags; each 1–50 chars, no whitespace; minimum 1 required
- \`memory_type\` — \`general\` | \`fact\` | \`plan\` | \`decision\` | \`reflection\` | \`lesson\` | \`error\` | \`gradient\` (default \`general\`)
- \`importance\` — Integer 0–10 (default 0; 10 = critical)
- \`created_at\`, \`updated_at\` — ISO 8601 timestamps

### Relationship
- Directed edge: \`from_hash -[relation_type]-> to_hash\`
- \`relation_type\` — Free-form string, 1–50 chars, no whitespace
- Suggested types: \`related_to\`, \`causes\`, \`depends_on\`, \`parent_of\`, \`child_of\`, \`supersedes\`, \`contradicts\`, \`supports\`, \`references\`
- Both endpoints must exist before creating a relationship
- Cascade-deleted when either endpoint memory is deleted
- Cascade-updated when either endpoint hash changes (ON UPDATE CASCADE)`;

const WORKFLOWS = `### Store and Link
\`\`\`
store_memories({ items: [...] })         → { items[].hash, succeeded, failed }
create_relationship({ from_hash, to_hash, relation_type })  × N
\`\`\`

### Search and Read
\`\`\`
search_memories({ query, limit })        → { memories[], nextCursor }
# or, for relationship navigation:
recall({ query, depth: 1 })             → { memories[], graph[] }
\`\`\`

### Fill Context Window
\`\`\`
retrieve_context({ query, token_budget: 4000, strategy: 'relevance' })
  → { memories[], estimated_tokens, truncated }
\`\`\`

### Update a Memory
\`\`\`
update_memory({ hash, content })         → { old_hash, new_hash }
# Existing relationships auto-update to new_hash via CASCADE
\`\`\`

### Batch Delete
\`\`\`
delete_memories({ hashes: [...] })       → { items[].{ hash, deleted }, succeeded, failed }
# deleted: false means hash not found — not an error
\`\`\``;

function buildToolRouting(): string {
  const rows = getToolContracts().map((c) => {
    const purpose = c.description.split('.')[0] ?? '';
    return `| \`${c.name}\` | ${purpose} |`;
  });

  return [
    '## Tool Routing',
    '',
    '| Tool | Purpose |',
    '| --- | --- |',
    ...rows,
  ].join('\n');
}

function renderSharedConstraints(): string {
  return getSharedConstraints()
    .map((c) => `- ${c}`)
    .join('\n');
}

export function buildServerInstructions(): string {
  return [
    '# Memory MCP — Usage Guide',
    '',
    buildToolRouting(),
    '',
    '## Shared Constraints',
    renderSharedConstraints(),
    '',
    '## Error Codes',
    ERROR_CODES.join('\n'),
    '',
    '## Data Model',
    DATA_MODEL,
    '',
    '## Common Workflows',
    WORKFLOWS,
    '',
    '## Prompts',
    PROMPTS_INVENTORY.join('\n'),
    '',
    '## Resources',
    RESOURCES_INVENTORY.join('\n'),
  ].join('\n');
}
