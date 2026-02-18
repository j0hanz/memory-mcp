# Memory MCP Server

A persistent, SQL-backed MCP (Model Context Protocol) memory server for AI assistants. Stores memories with full-text search, knowledge-graph relationships, and cursor-based pagination.

## Features

- **Persistent storage** — SQLite via Node.js built-in `node:sqlite` (requires Node ≥ 24)
- **Full-text search** — FTS5-powered `search_memories` and `recall` tools
- **Knowledge graph** — Directed, labeled relationships between memories
- **BFS traversal** — `recall` tool traverses relationship edges up to N hops
- **Batch operations** — `store_memories` and `delete_memories` for atomic bulk writes
- **Resource completion** — `memory://memories/{hash}` URI template with hash autocomplete
- **MCP compliant** — Built on `@modelcontextprotocol/sdk` v1.26.0

## Requirements

- Node.js ≥ 24 (for stable `node:sqlite` and FTS5 support)
- SQLite build with FTS5 enabled (included by default in Node.js distributions)

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server (stdio transport)

```bash
# Default: stores data in ./memory.db
node dist/index.js

# Custom database path
MEMORY_DB_PATH=/path/to/memories.db node dist/index.js
```

### Environment Variables

| Variable         | Default     | Description                      |
| ---------------- | ----------- | -------------------------------- |
| `MEMORY_DB_PATH` | `memory.db` | Path to the SQLite database file |

## Tools

| Tool                  | Description                              |
| --------------------- | ---------------------------------------- |
| `store_memory`        | Store a single memory (idempotent)       |
| `store_memories`      | Batch store up to 50 memories atomically |
| `get_memory`          | Retrieve a memory by its SHA-256 hash    |
| `update_memory`       | Replace content of an existing memory    |
| `delete_memory`       | Delete a single memory                   |
| `delete_memories`     | Batch delete memories                    |
| `search_memories`     | FTS5 full-text search with pagination    |
| `recall`              | FTS search + BFS graph traversal         |
| `memory_stats`        | Aggregate statistics                     |
| `create_relationship` | Create a directed relationship edge      |
| `delete_relationship` | Remove a relationship edge               |
| `get_relationships`   | List all relationships for a memory      |

## Resources

| URI                        | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `internal://instructions`  | Full usage guide (this doc as Markdown)               |
| `memory://memories/{hash}` | Fetch a memory by SHA-256 hash (with hash completion) |

## Prompts

| Name       | Description                    |
| ---------- | ------------------------------ |
| `get-help` | Returns the usage instructions |

## Memory Model

```
Memory {
  hash: string        // SHA-256(content + sorted tags) — 64 hex chars
  content: string     // Max 100,000 characters
  tags: string[]      // 1-100 tags, no whitespace, max 50 chars each
  memory_type: enum   // general | fact | plan | decision | reflection | lesson | error | gradient
  importance: int     // 0-10 (0=lowest, 10=critical)
  created_at: string  // ISO 8601 timestamp
  updated_at: string  // ISO 8601 timestamp
}

Relationship {
  from_hash: string
  to_hash: string
  relation_type: string  // e.g. related_to, causes, depends_on
  created_at: string
}
```

## Development

```bash
npm run type-check  # TypeScript type checking
npm run build       # Full build
npm test            # Build + run tests
npm run lint        # ESLint
```

## License

MIT
