# MEMORY-MCP INSTRUCTIONS

These instructions are available as a resource `internal://instructions` or prompt `get-help`. Load them when unsure about tool usage.

---

## CORE CAPABILITY

- Domain: SQLite-backed memory store with FTS5 search and knowledge graph for AI assistants.
- Primary Resources: Memories (content+tags+hash), Relationships (directed edges).
- Tools: `search_memories`, `get_memory`, `recall`, `get_relationships`, `memory_stats`, `retrieve_context` (READ); `store_memory`, `store_memories`, `update_memory`, `delete_memory`, `delete_memories`, `create_relationship`, `delete_relationship` (WRITE).

---

## PROMPTS

- `get-help`: Returns these instructions for quick recall.

---

## RESOURCES & RESOURCE LINKS

- `internal://instructions`: This document.
- `memory://memories/{hash}`: Retrieve a single memory by its SHA-256 hash.
- If a tool response includes a `resourceUri` or `resource_link`, call `resources/read` with the URI to fetch the full payload.

---

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: RECALL & EXPLORATION

- Call `search_memories` with `{ query }` to find memories by content/tags.
- Call `recall` with `{ query, depth }` to traverse graph connections from hits.
- Call `get_memory` with `{ hash }` for exact retrieval using hash from results.
  NOTE: Never guess hashes. Always search first.

### WORKFLOW B: KNOWLEDGE MANAGEMENT (STORAGE)

- Call `store_memory` or `store_memories` (batch ≤50) to persist content with tags.
- Call `create_relationship` to link memories via `{ from_hash, to_hash, relation_type }`.
- Call `update_memory` with `{ hash, content }` to revise — returns new hash.
  NOTE: `update_memory` changes the hash because hash depends on content.

### WORKFLOW C: CONTEXT RETRIEVAL (RAG)

- Call `retrieve_context` with `{ query, token_budget }` to get relevant memories fitting a token limit.
- Use `strategy='importance'` for high-priority items or `strategy='recency'` for latest updates.
  NOTE: Output is truncated to fit `token_budget`.

### WORKFLOW D: CLEANUP & MAINTENANCE

- Call `delete_memory` or `delete_memories` to remove obsolete items.
- Call `delete_relationship` to remove specific edges.
- Call `memory_stats` to monitor database size and health.
  NOTE: Always confirm destructive actions (delete) with the user first.

---

## TOOL NUANCES & GOTCHAS

`store_memory` / `store_memories`

- Purpose: Persist memory content.
- Input: `tags` (array, no whitespace, max 50 chars each), `importance` (0-10).
- Output: Returns `hash` and `created` boolean.
- Gotcha: Idempotent. Storing identical content+tags returns existing hash with `created: false`.

`update_memory`

- Purpose: Modify memory content.
- Input: Requires `hash` and new `content`. `tags` optional.
- Output: Returns `old_hash` and `new_hash`.
- Nuance: Changing content changes the hash. The old memory is effectively replaced.

`search_memories`

- Purpose: FTS5 full-text search over content and tags.
- Input: `query`, `limit` (default 20), `cursor` for pagination.
- Limits: Max 100 results per call.
- Gotcha: Query terms are matched individually; FTS5 phrase operators and negation are not supported.

`recall`

- Purpose: Graph traversal starting from search hits.
- Input: `depth` (0-3, default 1). 0 = search only. Higher depth = more hops.
- Gotcha: High depth may return large graphs. Use cautiously.

`retrieve_context`

- Purpose: Get memories optimized for LLM context window.
- Input: `token_budget` (default 4000).
- Output: `memories` array and `truncated` boolean.

`create_relationship`

- Purpose: Link two memories.
- Input: `from_hash`, `to_hash`, `relation_type` (e.g., related_to, causes).
- Gotcha: Both hashes must exist.

---

## CROSS-FEATURE RELATIONSHIPS

- Use `store_memory` to get hashes, then `create_relationship` to link them.
- Use `search_memories` to find entry points for `recall` traversals.
- `retrieve_context` uses the same ranking as `search_memories` but limits by token count.

---

## CONSTRAINTS & LIMITATIONS

- Content size: Max 100,000 characters per memory.
- Batch size: Max 50 items for `store_memories` and `delete_memories`.
- Tags: Max 100 tags per memory, no whitespace.
- Relationships: Directed edges only.

---

## ERROR HANDLING STRATEGY

- `E_NOT_FOUND`: Memory hash or relationship not found. → Search/recall to find valid hashes.
- `E_INVALID_CURSOR`: Pagination cursor invalid or expired. → Restart search without cursor.
- `E_UNKNOWN`: Unexpected internal error. → Check input format and retry.
