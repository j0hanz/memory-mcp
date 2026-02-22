import { getSharedConstraints } from './tool-info.js';

const WORKFLOW_TRACKS = `## Workflow A: Store and Link

1. \`store_memories({ items: [...] })\` → \`{ items[].hash, succeeded, failed }\`
2. \`create_relationship({ from_hash, to_hash, relation_type })\` × N

> Constraint: Both endpoint memories must exist before creating a relationship.

## Workflow B: Search and Read

1. \`search_memories({ query, limit })\` → \`{ memories[], nextCursor }\`
2. \`get_memory({ hash })\` for full detail on a specific result

> Or use \`recall({ query, depth: 1 })\` → \`{ memories[], graph[] }\` to follow relationships.

## Workflow C: Fill Context Window

1. \`retrieve_context({ query, token_budget: 4000, strategy: 'relevance' })\` → \`{ memories[], estimated_tokens, truncated }\`

> Use \`strategy\` to control sort: \`relevance\` (FTS rank), \`importance\` (highest first), or \`recency\` (newest first).

## Workflow D: Update a Memory

1. \`update_memory({ hash, content })\` → \`{ old_hash, new_hash }\`

> Existing relationships auto-update to new_hash via CASCADE.
> Returns E_CONFLICT if the new content+tags already maps to an existing hash.

## Workflow E: Batch Delete

1. \`delete_memories({ hashes: [...] })\` → \`{ items[].{ hash, deleted }, succeeded, failed }\`

> \`deleted: false\` means hash not found — not an error, the batch still succeeds.

## Workflow F: Explore Graph

1. \`recall({ query, depth: 2 })\` → \`{ memories[], graph[], depth_reached, aborted }\`
2. \`get_relationships({ hash, direction: 'both' })\` for a specific memory's edges

> BFS traversal emits progress per hop. Use \`depth: 0\` to skip traversal.`;

export function buildWorkflowGuide(): string {
  return [
    '# Workflow Reference',
    '',
    WORKFLOW_TRACKS,
    '',
    '## Shared Constraints',
    getSharedConstraints()
      .map((c) => `- ${c}`)
      .join('\n'),
    '',
    '> See `internal://tool-catalog` for complete tool reference and cross-tool data flow.',
  ].join('\n');
}
