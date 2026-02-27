import { getSharedConstraints } from './tool-info.js';

interface WorkflowTrack {
  title: string;
  steps: string[];
  notes: string[];
}

const WORKFLOW_TRACKS: readonly WorkflowTrack[] = [
  {
    title: 'Workflow A: Store and Link',
    steps: [
      '`store_memories({ items: [...] })` → `{ items[].hash, succeeded, failed }`',
      '`create_relationship({ from_hash, to_hash, relation_type })` × N',
    ],
    notes: [
      'Constraint: Both endpoint memories must exist before creating a relationship.',
    ],
  },
  {
    title: 'Workflow B: Search and Read',
    steps: [
      '`search_memories({ query, limit })` → `{ memories[], nextCursor }`',
      '`get_memory({ hash })` for full detail on a specific result',
    ],
    notes: [
      'Or use `recall({ query, depth: 1 })` → `{ memories[], graph[] }` to follow relationships.',
    ],
  },
  {
    title: 'Workflow C: Fill Context Window',
    steps: [
      "`retrieve_context({ query, token_budget: 4000, strategy: 'relevance' })` → `{ memories[], estimated_tokens, truncated }`",
    ],
    notes: [
      'Use `strategy` to control sort: `relevance` (FTS rank), `importance` (highest first), or `recency` (newest first).',
    ],
  },
  {
    title: 'Workflow D: Update a Memory',
    steps: ['`update_memory({ hash, content })` → `{ old_hash, new_hash }`'],
    notes: [
      'Existing relationships auto-update to new_hash via CASCADE.',
      'Returns E_CONFLICT if the new content+tags already maps to an existing hash.',
    ],
  },
  {
    title: 'Workflow E: Batch Delete',
    steps: [
      '`delete_memories({ hashes: [...] })` → `{ items[].{ hash, deleted }, succeeded, failed }`',
    ],
    notes: [
      '`deleted: false` means hash not found - not an error, the batch still succeeds.',
    ],
  },
  {
    title: 'Workflow F: Explore Graph',
    steps: [
      '`recall({ query, depth: 2 })` → `{ memories[], graph[], depth_reached, aborted }`',
      "`get_relationships({ hash, direction: 'both' })` for a specific memory's edges",
    ],
    notes: [
      'BFS traversal emits progress per hop. Use `depth: 0` to skip traversal.',
    ],
  },
];

function renderSharedConstraintsSection(): string {
  return getSharedConstraints()
    .map((c) => `- ${c}`)
    .join('\n');
}

function renderWorkflowTrack(track: WorkflowTrack): string {
  const stepLines = track.steps
    .map((step, idx) => `${idx + 1}. ${step}`)
    .join('\n');
  const noteLines = track.notes.map((note) => `> ${note}`).join('\n');
  return [`## ${track.title}`, '', stepLines, '', noteLines].join('\n');
}

function renderWorkflowTracks(): string {
  return WORKFLOW_TRACKS.map(renderWorkflowTrack).join('\n\n');
}

export function buildWorkflowGuide(): string {
  return [
    '# Workflow Reference',
    '',
    renderWorkflowTracks(),
    '',
    '## Shared Constraints',
    renderSharedConstraintsSection(),
    '',
    '> See `internal://tool-catalog` for complete tool reference and cross-tool data flow.',
  ].join('\n');
}
