# Memory INSTRUCTIONS

> Available as resource `internal://instructions`. Load when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: SQLite-backed memory store with FTS5 search and knowledge graph for AI assistants.
- Primary Resources: Memory (content+tags+hash), Relationship (directed edges).
- Tools: `search_memories` `get_memory` `recall` `get_relationships` `memory_stats` (READ); `store_memory` `store_memories` `update_memory` `delete_memory` `delete_memories` `create_relationship` `delete_relationship` (WRITE).

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.
- `memory://memories/{hash}`: Retrieve a single memory by SHA-256 hash (JSON). Supports hash autocompletion.

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: Recall & Exploration

1. Call `search_memories` with `{ query }` to find memories by content/tags.
2. Call `recall` with `{ query, depth }` to traverse graph connections from search hits.
3. Call `get_memory` with `{ hash }` for exact retrieval using a hash from previous results.
   NOTE: Never guess hashes. Always search first.

### WORKFLOW B: Knowledge Storage

1. Call `store_memory` to persist a single memory with content, tags, and optional type/importance.
2. Call `store_memories` for batch storage (up to 50 items, atomic transaction).
3. Call `create_relationship` to link memories via `{ from_hash, to_hash, relation_type }`.
   NOTE: Both hashes must exist before creating a relationship.

### WORKFLOW C: Knowledge Management

1. Call `update_memory` with `{ hash, content }` to revise — returns a **new hash** (hash changes on content/tag update).
2. Call `delete_memory` or `delete_memories` to remove items. Deleting a memory cascades to its relationships.
3. Call `delete_relationship` to remove a specific edge.
   NOTE: Confirm destructive actions with the user first.

### WORKFLOW D: Diagnostics & Graph Inspection

1. Call `memory_stats` (no input) to get counts, timestamps, and type breakdown.
2. Call `get_relationships` with `{ hash, direction }` to inspect a memory's connections.

---

## TOOL NUANCES & GOTCHAS

`store_memory` / `store_memories`

- Idempotent: storing the same content+tags returns the existing hash with `created: false`.
- Hash is computed from `SHA-256(content + sorted_tags)` — changing tags produces a different hash.
- `importance`: integer 0–10 (default 0). `memory_type`: one of `general`, `fact`, `plan`, `decision`, `reflection`, `lesson`, `error`, `gradient` (default `general`).
- Batch: `store_memories` accepts 1–50 items. All succeed or the transaction rolls back.

`search_memories`

- Uses FTS5 full-text search over content and tags. Results ranked by relevance.
- `limit`: 1–100 (default 20). Returns `nextCursor` for pagination.
- Query is sanitized to alphanumeric tokens — special characters are stripped.

`recall`

- Seeds from FTS5 search, then performs BFS traversal up to `depth` hops (0–3, default 1).
- `depth: 0` returns only search results with no graph traversal.
- `limit`: 1–50 (default 10) controls the seed count, not the total.
- Returns all discovered `memories` and the `graph` edges connecting them.
- BFS frontier capped at 1,000 nodes per hop to prevent unbounded memory usage.

`update_memory`

- `hash` must exist (`E_NOT_FOUND` otherwise). New `content` required; `tags` optional (kept if omitted).
- Returns `{ old_hash, new_hash }`. **The hash changes** — update references accordingly.
- Emits a `resources/updated` notification for the old hash URI.

`get_relationships`

- `direction`: `outgoing` | `incoming` | `both` (default `both`).
- Each relationship includes the linked memory's content and tags inline.
- Returns `E_NOT_FOUND` if the source hash does not exist.

`delete_memory` / `delete_memories`

- Deleting a memory cascades to all its relationships (foreign key ON DELETE CASCADE).
- Batch: `delete_memories` accepts 1–50 hashes. Atomic transaction.
- Items not found are returned with `deleted: false` (not an error in batch mode).

`create_relationship` / `delete_relationship`

- `create_relationship`: Idempotent — re-creating returns `created: false`.
- `relation_type`: no whitespace, max 50 chars (e.g., `related_to`, `causes`, `depends_on`).
- `delete_relationship`: Returns `E_NOT_FOUND` if the exact edge does not exist.

`memory_stats`

- No input. Returns total memories, total relationships, oldest/newest timestamps, average importance, and per-type breakdown.

---

## CROSS-FEATURE RELATIONSHIPS

- Use `search_memories` results to obtain hashes for `get_memory`, `update_memory`, `delete_memory`, and `create_relationship`.
- Use `recall` to discover connected memories and graph edges in a single call — combines FTS5 search with BFS traversal.
- `update_memory` changes the hash — any relationships referencing the old hash are updated via CASCADE.
- `memory://memories/{hash}` resource provides the same data as `get_memory` but through the MCP resource protocol.

---

## CONSTRAINTS & LIMITATIONS

- Transport: stdio only.
- Requires Node.js ≥ 24 with built-in `node:sqlite` and FTS5 support.
- Database path: set via `MEMORY_DB_PATH` env var (default: `memory.db`).
- SQLite busy timeout: 5,000 ms.
- Content: max 100,000 characters per memory.
- Tags: 1–100 per memory, each max 50 chars, no whitespace.
- Hash: 64 lowercase hex characters (SHA-256).
- Search query: 1–1,000 characters.
- Batch operations: max 50 items per call.
- Pagination cursors are base64url-encoded offsets — do not construct manually.

---

## ERROR HANDLING STRATEGY

- `E_NOT_FOUND`: Hash or relationship missing. → Call `search_memories` or `recall` to find valid hashes.
- `E_DUPLICATE`: Entry already exists. → Safe to ignore for idempotent operations.
- `E_CONSTRAINT`: Foreign key or uniqueness violation. → Verify both hashes exist before creating relationships.
- `E_INVALID_CURSOR`: Malformed pagination cursor. → Drop the cursor and restart from the first page.
- `E_TIMEOUT`: SQLite busy timeout exceeded (5s). → Retry after a brief delay; reduce batch size if persistent.
- `E_UNKNOWN`: Unexpected error. → Check the error message for details; retry once.

---
