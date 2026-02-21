# Memory MCP — Usage Guide

## Tool Routing

| Goal                             | Tool                                  |
| -------------------------------- | ------------------------------------- |
| Store one memory                 | `store_memory`                        |
| Store 2–50 memories atomically   | `store_memories` ← prefer for batches |
| Fetch by exact hash              | `get_memory`                          |
| Full-text search with pagination | `search_memories`                     |
| Fill a token budget from search  | `retrieve_context`                    |
| Explore relationships via graph  | `recall`                              |
| Replace content/tags of a memory | `update_memory`                       |
| Delete one memory                | `delete_memory`                       |
| Delete 2–50 memories atomically  | `delete_memories`                     |
| Add a directed edge              | `create_relationship`                 |
| Remove a directed edge           | `delete_relationship`                 |
| List edges for a memory          | `get_relationships`                   |
| Aggregate counts and timestamps  | `memory_stats`                        |

## Error Codes

| Code          | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `E_NOT_FOUND` | Hash or relationship does not exist                                  |
| `E_CONFLICT`  | `update_memory` target content+tags already maps to an existing hash |
| `E_UNKNOWN`   | Unexpected internal error — retry once                               |

## Data Model

### Memory

- `hash` — SHA-256 of `(content + sorted tags)`; deterministic; changes when content or tags change
- `content` — Text; 1–100,000 chars
- `tags` — Array; 1–100 tags; each 1–50 chars, no whitespace; minimum 1 required
- `memory_type` — `general` | `fact` | `plan` | `decision` | `reflection` | `lesson` | `error` | `gradient` (default `general`)
- `importance` — Integer 0–10 (default 0; 10 = critical)
- `created_at`, `updated_at` — ISO 8601 timestamps

### Relationship

- Directed edge: `from_hash -[relation_type]-> to_hash`
- `relation_type` — Free-form string, 1–50 chars, no whitespace
- Suggested types: `related_to`, `causes`, `depends_on`, `parent_of`, `child_of`, `supersedes`, `contradicts`, `supports`, `references`
- Both endpoints must exist before creating a relationship
- Cascade-deleted when either endpoint memory is deleted
- Cascade-updated when either endpoint hash changes (ON UPDATE CASCADE)

## Behavior Notes

### Idempotence

- `store_memory`: same content+tags → existing hash with `created: false`
- `store_memories`: per-item idempotent — each item independently returns `created: false` if already exists
- `create_relationship`: re-creating an existing edge → `created: false`; no error

### Atomic Transactions

- `store_memories`: all items succeed or all roll back
- `delete_memories`: all items roll back on unexpected error; `deleted: false` per item means hash not found — not an error
- `update_memory`: existence check, collision check, and UPDATE run inside a single IMMEDIATE transaction (TOCTOU-safe)

### Hash Changes

- `update_memory` changes the hash when content or tags change
- Relationships survive a hash change automatically via `ON UPDATE CASCADE`
- Returns both `old_hash` and `new_hash`

## FTS Search Limits

- All-OR term matching: query terms matched individually; phrase operators and negation not supported
- `search_memories`: cursor-paginated; max 100 results per page (default 20)
- `retrieve_context`: max 200 candidates evaluated; returns `truncated: true` when token budget is hit
- `recall` BFS safety limits (env-configurable):
  - `RECALL_MAX_FRONTIER_SIZE` — default 1000
  - `RECALL_MAX_EDGE_ROWS` — default 5000
  - `RECALL_MAX_VISITED_NODES` — default 5000
  - Returns `aborted: true` with partial results when any limit is hit — partial results are valid

## Common Workflows

### Store and Link

```
store_memories({ items: [...] })         → { items[].hash, succeeded, failed }
create_relationship({ from_hash, to_hash, relation_type })  × N
```

### Search and Read

```
search_memories({ query, limit })        → { memories[], nextCursor }
# or, for relationship navigation:
recall({ query, depth: 1 })             → { memories[], graph[] }
```

### Fill Context Window

```
retrieve_context({ query, token_budget: 4000, strategy: 'relevance' })
  → { memories[], estimated_tokens, truncated }
```

### Update a Memory

```
update_memory({ hash, content })         → { old_hash, new_hash }
# Existing relationships auto-update to new_hash via CASCADE
```

### Batch Delete

```
delete_memories({ hashes: [...] })       → { items[].{ hash, deleted }, succeeded, failed }
# deleted: false means hash not found — not an error
```

## Resources

- `internal://instructions` — This document. Read for tool routing, error codes, and workflows.
- `memory://memories/{hash}` — Fetch a single memory by URI with hash auto-completion.
