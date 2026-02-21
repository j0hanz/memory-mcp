import { getToolContracts } from './tool-contracts.js';

const SHARED_CONSTRAINTS = [
  'Idempotence: `store_memory` and `store_memories` return `created: false` if content+tags already exist.',
  'Atomic Transactions: `store_memories` and `delete_memories` roll back entirely on unexpected errors.',
  'Hash Changes: `update_memory` changes the hash when content or tags change. Relationships survive via CASCADE.',
  'FTS Search Limits: Query terms matched individually (all-OR logic). Phrase operators and negation not supported.',
  'Recall Limits: BFS traversal is bounded by env vars (RECALL_MAX_FRONTIER_SIZE, RECALL_MAX_EDGE_ROWS, RECALL_MAX_VISITED_NODES). Returns `aborted: true` with partial results when limits are hit.',
];

const ERROR_CODES = [
  '| Code | Meaning |',
  '| --- | --- |',
  '| `E_NOT_FOUND` | Hash or relationship does not exist |',
  '| `E_CONFLICT` | `update_memory` target content+tags already maps to an existing hash |',
  '| `E_CANCELLED` | Request was cancelled |',
  '| `E_UNKNOWN` | Unexpected internal error — retry once |',
];

const DATA_MODEL = `
### Memory
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
- Cascade-updated when either endpoint hash changes (ON UPDATE CASCADE)
`;

const WORKFLOWS = `
### Store and Link
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
\`\`\`
`;

let cachedInstructions: string | undefined;

export function loadInstructions(): string {
  if (cachedInstructions !== undefined) {
    return cachedInstructions;
  }

  const contracts = getToolContracts();
  const toolRows = contracts.map((c) => {
    return `| \`${c.name}\` | ${c.description.split('.')[0] ?? ''} |`;
  });

  cachedInstructions = [
    '# Memory MCP — Usage Guide',
    '## Tool Routing',
    '| Tool | Purpose |',
    '| --- | --- |',
    ...toolRows,
    '',
    '## Shared Constraints',
    SHARED_CONSTRAINTS.map((c) => `- ${c}`).join('\n'),
    '## Error Codes',
    ERROR_CODES.join('\n'),
    '## Data Model',
    DATA_MODEL,
    '## Common Workflows',
    WORKFLOWS,
    '## Resources',
    '- `internal://instructions` — This document. Read for tool routing, error codes, and workflows.',
    '- `memory://memories/{hash}` — Fetch a single memory by URI with hash auto-completion.',
  ].join('\n\n');

  return cachedInstructions;
}
