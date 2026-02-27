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
  { capability: 'resources', status: 'enabled (list/read + listChanged)' },
  { capability: 'prompts', status: 'enabled' },
  { capability: 'completions', status: 'enabled' },
  { capability: 'logging', status: 'enabled' },
] as const;

interface TableSection {
  title: string;
  header: string;
  separator: string;
  rows: string[];
}

function toEnvVarRow(v: (typeof ENV_VARS)[number]): string {
  return `| \`${v.name}\` | ${v.default} | ${v.range} | ${v.purpose} |`;
}

function toTwoColumnRow(label: string, value: string): string {
  return `| ${label} | ${value} |`;
}

function renderTableSection(section: TableSection): string[] {
  return [
    `## ${section.title}`,
    '',
    section.header,
    section.separator,
    ...section.rows,
    '',
  ];
}

export function buildServerConfig(): string {
  const sections: TableSection[] = [
    {
      title: 'Environment Variables',
      header: '| Variable | Default | Range | Purpose |',
      separator: '|----------|---------|-------|---------|',
      rows: ENV_VARS.map(toEnvVarRow),
    },
    {
      title: 'Capabilities',
      header: '| Capability | Status |',
      separator: '|------------|--------|',
      rows: CAPABILITIES.map((c) => toTwoColumnRow(c.capability, c.status)),
    },
    {
      title: 'Data Limits',
      header: '| Dimension | Range |',
      separator: '|-----------|-------|',
      rows: DATA_LIMITS.map((l) => toTwoColumnRow(l.dimension, l.range)),
    },
  ];

  return [
    '# Server Configuration',
    '',
    ...sections.flatMap(renderTableSection),
  ].join('\n');
}
