const ENV_VARS = [
  {
    name: 'MEMORY_DB_PATH',
    default: 'memory_db/memory.db',
    range: '—',
    purpose: 'SQLite database file path',
  },
  {
    name: 'RECALL_MAX_FRONTIER_SIZE',
    default: '1000',
    range: '100–50000',
    purpose: 'Maximum BFS frontier size per hop',
  },
  {
    name: 'RECALL_MAX_EDGE_ROWS',
    default: '5000',
    range: '100–50000',
    purpose: 'Maximum edge rows fetched per traversal',
  },
  {
    name: 'RECALL_MAX_VISITED_NODES',
    default: '5000',
    range: '100–50000',
    purpose: 'Maximum visited nodes during BFS traversal',
  },
] as const;

const DATA_LIMITS = [
  { dimension: 'Content length', range: '1–100,000 chars' },
  { dimension: 'Tags per memory', range: '1–100 tags' },
  { dimension: 'Tag length', range: '1–50 chars, no whitespace' },
  { dimension: 'Batch size', range: '1–50 items' },
  { dimension: 'Search results per page', range: '1–100 (default 20)' },
  { dimension: 'Recall depth', range: '0–3 hops' },
  { dimension: 'Token budget', range: '100–200,000' },
  { dimension: 'Hash format', range: 'SHA-256, 64 hex chars' },
  { dimension: 'Relation type', range: '1–50 chars, no whitespace' },
  { dimension: 'Importance', range: '0–10 (integer)' },
] as const;

const CAPABILITIES = [
  { capability: 'tools', status: 'enabled' },
  { capability: 'resources', status: 'enabled (subscribe supported)' },
  { capability: 'prompts', status: 'enabled' },
  { capability: 'completions', status: 'enabled' },
  { capability: 'logging', status: 'enabled' },
  { capability: 'tasks', status: 'enabled' },
] as const;

export function buildServerConfig(): string {
  const envRows = ENV_VARS.map(
    (v) => `| \`${v.name}\` | ${v.default} | ${v.range} | ${v.purpose} |`
  );

  const limitRows = DATA_LIMITS.map((l) => `| ${l.dimension} | ${l.range} |`);

  const capRows = CAPABILITIES.map((c) => `| ${c.capability} | ${c.status} |`);

  return [
    '# Server Configuration',
    '',
    '## Environment Variables',
    '',
    '| Variable | Default | Range | Purpose |',
    '|----------|---------|-------|---------|',
    ...envRows,
    '',
    '## Capabilities',
    '',
    '| Capability | Status |',
    '|------------|--------|',
    ...capRows,
    '',
    '## Data Limits',
    '',
    '| Dimension | Range |',
    '|-----------|-------|',
    ...limitRows,
  ].join('\n');
}
