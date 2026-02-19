# MEMORY-MCP INSTRUCTIONS

These instructions are available as a resource (`internal://instructions`) or prompt (`get-help`). Load them when unsure about tool usage.

---

## CORE CAPABILITY

- **Domain:** SQLite-backed persistent memory storage, full-text search, and graph recall for LLM agents.
- **Primary Resources:** Memory entries (content + tags + metadata), directed labeled relationships between memories.
- **Tools:**
  - READ: `get_memory`, `search_memories`, `recall`, `retrieve_context`, `get_relationships`, `memory_stats`
  - WRITE: `store_memory`, `store_memories`, `update_memory`, `delete_memory`, `delete_memories`, `create_relationship`, `delete_relationship`

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.
- `memory://memories/{hash}`: Retrieve a single memory by its SHA-256 hash (JSON). Supports hash auto-completion.

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: STORE AND RETRIEVE

1. Call `store_memory` with `content`, `tags`, and optional `importance`/`memory_type` to persist a memory. Note the returned `hash`.
2. Call `get_memory` with `hash` to retrieve it later.
3. For bulk ingestion, call `store_memories` with up to 50 items in one atomic transaction.
   NOTE: Storing identical content+tags is idempotent — returns the existing hash with `created: false`.

### WORKFLOW B: SEARCH AND DISCOVER

1. Call `search_memories` with a `query` string to full-text search across content and tags.
2. Use `cursor` from the response's `nextCursor` to paginate through results.
3. Apply filters: `min_importance`, `max_importance`, `memory_type` to narrow results.
   NOTE: Query terms are matched individually. FTS5 phrase operators and negation are **not** supported.

### WORKFLOW C: GRAPH RECALL (BFS)

1. Call `recall` with a `query` and `depth` (0–3) to search memories and traverse relationships via BFS.
2. Inspect the returned `memories` (all discovered nodes) and `graph` (edges connecting them).
3. Use `depth: 0` for search-only (no traversal), `depth: 1–3` for progressively wider graph exploration.
   NOTE: If `aborted: true` is returned, the traversal hit a safety limit. Results are still valid but incomplete.

### WORKFLOW D: CONTEXT WINDOW MANAGEMENT

1. Call `retrieve_context` with a `query` and `token_budget` to get relevance-ranked memories that fit within a token limit.
2. Choose `strategy`: `relevance` (FTS rank, default), `importance` (highest first), or `recency` (newest first).
3. Check `truncated: true` to know if more memories matched but were excluded by the budget.
   NOTE: Eliminates manual pagination and token counting. Use this when filling an LLM context window.

### WORKFLOW E: BUILD KNOWLEDGE GRAPHS

1. Call `store_memory` (or `store_memories`) to create memories and note their hashes.
2. Call `create_relationship` with `from_hash`, `to_hash`, and `relation_type` to link them.
3. Call `get_relationships` to inspect edges for a memory (filter by `direction`: outgoing, incoming, or both).
4. Call `recall` with `depth: 1–3` to traverse the graph from a search query.
   NOTE: Both endpoint memories must exist before creating a relationship.

---

## TOOL NUANCES & GOTCHAS

`store_memory`

- Purpose: Store a single memory. Returns its SHA-256 hash.
- Gotcha: Hash is deterministic — computed from `content` + sorted `tags`. Same content+tags always produces the same hash.
- Gotcha: `importance` defaults to `0` if omitted. `memory_type` defaults to `general`.

`store_memories`

- Purpose: Batch store up to 50 memories in one atomic transaction.
- Gotcha: If the transaction fails, all items roll back. Per-item results indicate `created: true/false`.

`update_memory`

- Purpose: Replace content (and optionally tags) of an existing memory. Returns old and new hashes.
- Gotcha: The hash changes when content or tags change. Relationships automatically cascade to the new hash.
- Gotcha: Returns `E_CONFLICT` if a memory already exists with the new content+tags combination.

`search_memories`

- Purpose: Full-text search over content and tags using SQLite FTS5.
- Input: `limit` defaults to 20, max 100. `cursor` from previous `nextCursor` for pagination.
- Gotcha: Only alphanumeric tokens are indexed. Special characters and FTS5 operators are stripped from queries.

`recall`

- Purpose: FTS search + BFS graph traversal up to 3 hops.
- Input: `depth` defaults to 1, max 3. `limit` defaults to 10 (seed memories), max 50.
- Gotcha: Traversal is bounded by frontier size (default 1,000), edge count (default 5,000), and visited nodes (default 5,000). Override via `RECALL_MAX_FRONTIER_SIZE`, `RECALL_MAX_EDGE_ROWS`, `RECALL_MAX_VISITED_NODES` env vars.

`retrieve_context`

- Purpose: Token-budgeted memory retrieval — fills a token budget with ranked results.
- Input: `token_budget` defaults to 4,000, max 200,000. `strategy` defaults to `relevance`.
- Gotcha: Token estimation uses ~4 characters per token. Internal candidate cap is 200 rows.

`get_relationships`

- Purpose: Retrieve all relationships for a memory with the linked memory content inlined.
- Input: `direction` defaults to `both`. Options: `outgoing`, `incoming`, `both`.
- Gotcha: Returns `E_NOT_FOUND` if the source memory does not exist.

`create_relationship`

- Purpose: Create a directed labeled edge between two memories.
- Input: `relation_type` is free-form. Suggested types: `related_to`, `causes`, `depends_on`, `parent_of`, `child_of`, `supersedes`, `contradicts`, `supports`, `references`.
- Gotcha: Idempotent — re-creating an existing relationship is a no-op. Both memories must exist.

`delete_memory`

- Purpose: Delete a single memory and all its relationships.
- Side effects: Cascade-deletes all relationships involving this memory.

`delete_memories`

- Purpose: Batch delete up to 50 memories in one atomic transaction.
- Side effects: Cascade-deletes all relationships involving deleted memories.

`memory_stats`

- Purpose: Return aggregate statistics (total counts, oldest/newest timestamps, average importance, breakdown by type).

---

## CROSS-FEATURE RELATIONSHIPS

- `store_memory` / `store_memories` produce hashes required by `get_memory`, `update_memory`, `delete_memory`, `create_relationship`, and `get_relationships`.
- `search_memories` and `recall` share the same FTS5 index, query sanitization, and cursor pagination.
- `recall` combines `search_memories`-style FTS seeding with BFS graph traversal from `get_relationships`-style edge queries.
- `retrieve_context` uses the same FTS5 index but adds token budgeting and sort strategies on top.
- `update_memory` changes a memory's hash — relationships cascade automatically via foreign keys.
- `delete_memory` / `delete_memories` cascade-delete relationships via foreign keys.

---

## CONSTRAINTS & LIMITATIONS

- **Transport:** stdio only.
- **Runtime:** Node.js >= 24 with FTS5-enabled SQLite.
- **Database path:** Set via `MEMORY_DB_PATH` env var (default: `memory.db`).
- **Content size:** Max 100,000 characters per memory.
- **Tags:** 1–100 tags per memory, each max 50 characters, no whitespace.
- **Importance:** Integer 0–10 (0 = lowest, 10 = critical).
- **Memory types:** `general`, `fact`, `plan`, `decision`, `reflection`, `lesson`, `error`, `gradient`.
- **Search limit:** Max 100 results per query (default 20).
- **Recall depth:** Max 3 hops (default 1). Seed limit max 50 (default 10).
- **Retrieve context budget:** Max 200,000 tokens (default 4,000). Internal candidate cap: 200 rows.
- **Batch operations:** Max 50 items per `store_memories` / `delete_memories` call.
- **BFS safety limits:** Configurable via `RECALL_MAX_FRONTIER_SIZE` (default 1,000), `RECALL_MAX_EDGE_ROWS` (default 5,000), `RECALL_MAX_VISITED_NODES` (default 5,000).

---

## ERROR HANDLING STRATEGY

- `E_NOT_FOUND`: Memory or relationship does not exist. → Call `search_memories` to find the correct hash, or verify the hash with `get_memory`.
- `E_INVALID_CURSOR`: Pagination cursor is malformed or does not match the current query/filters. → Drop the cursor and restart pagination from the beginning.
- `E_CONFLICT`: `update_memory` target content+tags already exists as another memory. → Call `get_memory` with the conflicting hash or choose different content/tags.
- `E_DB_ERROR`: Database operation failed. → Check that the database file is accessible and not corrupted. Retry the operation.
- `E_UNKNOWN`: Unexpected internal error. → Retry the operation. If persistent, inspect server logs.
