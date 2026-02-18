# Memory MCP

<!-- markdownlint-disable MD033 -->

[![npm version](https://img.shields.io/npm/v/@j0hanz/memory-mcp?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@j0hanz/memory-mcp) [![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://github.com/j0hanz/memory-mcp/blob/master/package.json) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://github.com/j0hanz/memory-mcp/blob/master/package.json) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/j0hanz/memory-mcp/blob/master/package.json)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemory-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemory-mcp%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=memory-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovbWVtb3J5LW1jcEBsYXRlc3QiXX0=)

A SQLite-backed MCP server for persistent memory storage, full-text retrieval, and relationship graph traversal.

## Overview

Memory MCP provides a local, persistent memory layer for MCP-enabled assistants. It stores SHA-256-addressed memory items in SQLite with FTS5-powered full-text search, a directed relationship graph, BFS recall traversal, and token-budget-aware context retrieval — all accessible over stdio transport with no external dependencies.

## Key Features

- **13 MCP tools** for CRUD, batch operations, FTS5 search, BFS graph recall, token-budget context retrieval, relationships, and stats.
- **Full-text search** over content and tags via SQLite FTS5 with importance and type filters.
- **Graph recall** with BFS traversal, bounded frontier, and MCP progress notifications per hop.
- **Token-budget retrieval** (`retrieve_context`) selects memories that fit a caller-specified token budget — no manual pagination needed.
- **Strict Zod input validation** with typed output envelopes and SHA-256 hash addressing.
- **Resource support** with `internal://instructions` (Markdown guide) and `memory://memories/{hash}` URI template with hash auto-completion.
- **stdio transport** with clean shutdown handling (`SIGINT`, `SIGTERM`) and no HTTP endpoints.

## Requirements

- Node.js `>=24`.
- SQLite with FTS5 support (verified at startup).
- Any MCP client that supports stdio command servers.

## Quick Start

Use the npm package directly with `npx` — no installation required:

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memory-mcp@latest"]
    }
  }
}
```

> [!TIP]
> The server uses stdio transport only; no HTTP endpoint is exposed. Stdout must not be polluted by custom logging.

Or run with Docker:

```bash
docker run --rm -i ghcr.io/j0hanz/memory-mcp:latest
```

## Client Configuration

<details>
<summary><b>Install in VS Code</b></summary>

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemory-mcp%40latest%22%5D%7D)

Workspace file `.vscode/mcp.json`:

```json
{
  "servers": {
    "memory-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memory-mcp@latest"]
    }
  }
}
```

CLI:

```bash
code --add-mcp '{"name":"memory-mcp","command":"npx","args":["-y","@j0hanz/memory-mcp@latest"]}'
```

</details>

<details>
<summary><b>Install in VS Code Insiders</b></summary>

[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemory-mcp%40latest%22%5D%7D&quality=insiders)

CLI:

```bash
code-insiders --add-mcp '{"name":"memory-mcp","command":"npx","args":["-y","@j0hanz/memory-mcp@latest"]}'
```

</details>

<details>
<summary><b>Install in Cursor</b></summary>

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=memory-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovbWVtb3J5LW1jcEBsYXRlc3QiXX0=)

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memory-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><b>Install in Claude Desktop / Claude Code</b></summary>

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memory-mcp@latest"]
    }
  }
}
```

CLI:

```bash
claude mcp add memory-mcp -- npx -y @j0hanz/memory-mcp@latest
```

</details>

<details>
<summary><b>Install in Windsurf</b></summary>

MCP config:

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memory-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><b>Run with Docker</b></summary>

```bash
# Pull and run (stdio mode)
docker run --rm -i \
  -e MEMORY_DB_PATH=/data/memory.db \
  -v memory-data:/data \
  ghcr.io/j0hanz/memory-mcp:latest
```

MCP client config:

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "MEMORY_DB_PATH=/data/memory.db",
        "-v",
        "memory-data:/data",
        "ghcr.io/j0hanz/memory-mcp:latest"
      ]
    }
  }
}
```

</details>

## MCP Surface

### Tools Summary

| Tool                  | Category | Notes                                   |
| --------------------- | -------- | --------------------------------------- |
| `store_memory`        | Write    | Idempotent by content+sorted tags hash  |
| `store_memories`      | Write    | Batch (1–50), transaction-wrapped       |
| `get_memory`          | Read     | Hash lookup                             |
| `update_memory`       | Write    | Returns `old_hash` + `new_hash`         |
| `delete_memory`       | Write    | Cascades relationship deletion          |
| `delete_memories`     | Write    | Batch (1–50), transaction-wrapped       |
| `search_memories`     | Read     | FTS5 + importance/type filters + cursor |
| `create_relationship` | Write    | Idempotent directed edge creation       |
| `delete_relationship` | Write    | Deletes exact directed edge             |
| `get_relationships`   | Read     | Direction filter + linked memory fields |
| `recall`              | Read     | FTS5 seed + BFS traversal (depth 0–3)   |
| `retrieve_context`    | Read     | Token-budget-aware context retrieval    |
| `memory_stats`        | Read     | Store aggregates and type breakdown     |

---

### `store_memory`

Store a new memory with content, tags, and optional type/importance. Idempotent — storing the same content+tags returns the existing hash with `created: false`.

| Name          | Type       | Required | Default   | Description                                                                        |
| ------------- | ---------- | -------- | --------- | ---------------------------------------------------------------------------------- |
| `content`     | `string`   | Yes      | —         | Memory content (1–100000 chars)                                                    |
| `tags`        | `string[]` | Yes      | —         | 1–100 tags, each max 50 chars, no whitespace                                       |
| `memory_type` | enum       | No       | `general` | `general`, `fact`, `plan`, `decision`, `reflection`, `lesson`, `error`, `gradient` |
| `importance`  | `integer`  | No       | `0`       | Priority 0–10                                                                      |

Returns: `{ ok, result: { hash, created } }`

---

### `store_memories`

Store multiple memories in one transaction (max 50 items).

| Name    | Type                     | Required | Description                                                                            |
| ------- | ------------------------ | -------- | -------------------------------------------------------------------------------------- |
| `items` | `Array<StoreMemoryItem>` | Yes      | 1–50 items, each with `content`, `tags`, optional `memory_type`, optional `importance` |

Returns: `{ ok, result: { items, succeeded, failed } }`

---

### `get_memory`

Retrieve one memory by its SHA-256 hash.

| Name   | Type     | Required | Description                   |
| ------ | -------- | -------- | ----------------------------- |
| `hash` | `string` | Yes      | 64-char lowercase SHA-256 hex |

Returns: `{ ok, result: Memory }` or `{ ok: false, error }` on `E_NOT_FOUND`.

---

### `update_memory`

Update content and optionally tags for an existing memory. Returns both hashes.

| Name      | Type       | Required | Default       | Description          |
| --------- | ---------- | -------- | ------------- | -------------------- |
| `hash`    | `string`   | Yes      | —             | Existing memory hash |
| `content` | `string`   | Yes      | —             | Replacement content  |
| `tags`    | `string[]` | No       | Existing tags | Replacement tags     |

Returns: `{ ok, result: { old_hash, new_hash } }`

---

### `delete_memory`

Delete one memory by hash. Cascades to related relationship rows.

| Name   | Type     | Required | Description |
| ------ | -------- | -------- | ----------- |
| `hash` | `string` | Yes      | Memory hash |

Returns: `{ ok, result: { hash, deleted } }`

---

### `delete_memories`

Delete multiple memories by hash in one transaction.

| Name     | Type       | Required | Description        |
| -------- | ---------- | -------- | ------------------ |
| `hashes` | `string[]` | Yes      | 1–50 memory hashes |

Returns: `{ ok, result: { items, succeeded, failed } }`

---

### `search_memories`

Full-text search over memory content and tags using FTS5. Supports importance and type filters with cursor pagination.

| Name             | Type      | Required | Default | Description                                               |
| ---------------- | --------- | -------- | ------- | --------------------------------------------------------- |
| `query`          | `string`  | Yes      | —       | Search text (1–1000 chars)                                |
| `limit`          | `integer` | No       | `20`    | Results per page (1–100)                                  |
| `cursor`         | `string`  | No       | —       | Pagination cursor from previous response                  |
| `min_importance` | `integer` | No       | —       | Only return memories with importance >= this value (0–10) |
| `max_importance` | `integer` | No       | —       | Only return memories with importance <= this value (0–10) |
| `memory_type`    | enum      | No       | —       | Filter by memory type                                     |

Returns: `{ ok, result: { memories, total_returned, nextCursor? } }`

---

### `create_relationship`

Create a directed relationship edge between two memories. Idempotent.

Suggested `relation_type` values: `related_to`, `causes`, `depends_on`, `parent_of`, `child_of`, `supersedes`, `contradicts`, `supports`, `references`.

| Name            | Type     | Required | Description                                       |
| --------------- | -------- | -------- | ------------------------------------------------- |
| `from_hash`     | `string` | Yes      | Source memory hash                                |
| `to_hash`       | `string` | Yes      | Target memory hash                                |
| `relation_type` | `string` | Yes      | Edge label (1–50 chars, no whitespace, free-form) |

Returns: `{ ok, result: { created } }`

---

### `delete_relationship`

Delete one directed relationship edge.

| Name            | Type     | Required | Description       |
| --------------- | -------- | -------- | ----------------- |
| `from_hash`     | `string` | Yes      | Source hash       |
| `to_hash`       | `string` | Yes      | Target hash       |
| `relation_type` | `string` | Yes      | Relationship type |

Returns: `{ ok, result: { deleted } }` or `{ ok: false, error }` on `E_NOT_FOUND`.

---

### `get_relationships`

Retrieve relationships for a memory, with optional direction filter.

| Name        | Type     | Required | Default | Description                       |
| ----------- | -------- | -------- | ------- | --------------------------------- |
| `hash`      | `string` | Yes      | —       | Memory hash                       |
| `direction` | enum     | No       | `both`  | `outgoing`, `incoming`, or `both` |

Returns: `{ ok, result: { relationships, count } }`

Each relationship includes `from_hash`, `to_hash`, `relation_type`, `created_at`, `linked_hash`, `linked_content`, and `linked_tags`.

---

### `recall`

Search memories by full-text query, then traverse the relationship graph up to `depth` hops via BFS. Emits MCP progress notifications per hop.

| Name             | Type      | Required | Default | Description                                                |
| ---------------- | --------- | -------- | ------- | ---------------------------------------------------------- |
| `query`          | `string`  | Yes      | —       | Seed search query (1–1000 chars)                           |
| `depth`          | `integer` | No       | `1`     | BFS hops (0–3)                                             |
| `limit`          | `integer` | No       | `10`    | Seed memory count (1–50)                                   |
| `cursor`         | `string`  | No       | —       | Pagination cursor from previous response                   |
| `min_importance` | `integer` | No       | —       | Seed filter: only memories with importance >= value (0–10) |
| `max_importance` | `integer` | No       | —       | Seed filter: only memories with importance <= value (0–10) |
| `memory_type`    | enum      | No       | —       | Seed filter: only memories of this type                    |

Returns: `{ ok, result: { memories, graph, depth_reached, aborted?, nextCursor? } }`

Each item in `graph` uses the shape:

```json
{ "from_hash": "...", "to_hash": "...", "relation_type": "..." }
```

> [!NOTE]
> `aborted: true` indicates the traversal hit a safety limit (`RECALL_MAX_FRONTIER_SIZE`, `RECALL_MAX_EDGE_ROWS`, or `RECALL_MAX_VISITED_NODES`). Partial results are still returned.

---

### `retrieve_context`

Search memories and return relevance-ranked results that fit within a caller-specified token budget. Eliminates manual pagination and token counting for context window management.

| Name           | Type      | Required | Default     | Description                                                                                |
| -------------- | --------- | -------- | ----------- | ------------------------------------------------------------------------------------------ |
| `query`        | `string`  | Yes      | —           | Search query (1–1000 chars)                                                                |
| `token_budget` | `integer` | No       | `4000`      | Maximum estimated tokens to return (100–200000)                                            |
| `strategy`     | enum      | No       | `relevance` | Sort order: `relevance` (FTS rank), `importance` (highest first), `recency` (newest first) |

Returns: `{ ok, result: { memories, estimated_tokens, truncated } }`

> [!TIP]
> Token estimation is approximate (content length ÷ 4). `truncated: true` means the budget was reached before all candidates were included.

---

### `memory_stats`

Return aggregate memory and relationship stats. Takes no input.

Returns:

```json
{
  "ok": true,
  "result": {
    "memories": {
      "total": 0,
      "oldest": null,
      "newest": null,
      "avg_importance": null
    },
    "relationships": { "total": 0 },
    "by_type": {}
  }
}
```

---

### Resources

| URI                        | MIME               | Description                                           |
| -------------------------- | ------------------ | ----------------------------------------------------- |
| `internal://instructions`  | `text/markdown`    | Markdown usage guide for all tools and workflows      |
| `memory://memories/{hash}` | `application/json` | Returns one memory as JSON; hash completion supported |

### Prompts

| Name       | Arguments | Purpose                                       |
| ---------- | --------- | --------------------------------------------- |
| `get-help` | none      | Returns full usage instructions for all tools |

## Configuration

### Environment Variables

| Variable                   | Description                                             | Default     | Required |
| -------------------------- | ------------------------------------------------------- | ----------- | -------- |
| `MEMORY_DB_PATH`           | SQLite database file path                               | `memory.db` | No       |
| `RECALL_MAX_FRONTIER_SIZE` | Max BFS frontier nodes per hop (100–50000)              | `1000`      | No       |
| `RECALL_MAX_EDGE_ROWS`     | Max relationship rows fetched per traversal (100–50000) | `5000`      | No       |
| `RECALL_MAX_VISITED_NODES` | Max visited nodes across entire traversal (100–50000)   | `5000`      | No       |

> [!IMPORTANT]
> If `MEMORY_DB_PATH` is relative (including the default `memory.db`), it resolves from the process working directory.

### Limits and Constraints

| Item                            | Value                                             |
| ------------------------------- | ------------------------------------------------- |
| Content length                  | 1–100000 chars                                    |
| Tag count                       | 1–100 per memory                                  |
| Tag length                      | 1–50 chars, no whitespace                         |
| Hash format                     | 64-char lowercase hex SHA-256                     |
| Search query length             | 1–1000 chars                                      |
| `search_memories.limit`         | 1–100 (default 20)                                |
| `recall.depth`                  | 0–3 (default 1)                                   |
| `recall.limit`                  | 1–50 (default 10)                                 |
| `retrieve_context.token_budget` | 100–200000 (default 4000)                         |
| Batch size                      | 1–50 items (`store_memories`, `delete_memories`)  |
| Recall frontier guard           | `RECALL_MAX_FRONTIER_SIZE` (default 1000 per hop) |
| SQLite busy timeout             | 5000 ms                                           |

> [!NOTE]
> Cursor values are base64url-encoded offsets. Treat them as opaque tokens.

## Security

- Transport is stdio-only (`StdioServerTransport`) — no HTTP endpoints.
- Fatal process errors are written to `stderr`; stdout must remain clean for the MCP protocol.
- All inputs are validated with strict Zod schemas and bounded field constraints before any database access.
- Hashes are validated against a lowercase 64-char SHA-256 hex regex.
- Search input is tokenized to alphanumeric terms before FTS `MATCH` execution (non-alphanumeric characters act as delimiters, preventing FTS injection).
- SQLite foreign keys are enabled; relationship rows cascade-delete when a memory is removed.

## Development

Install dependencies:

```bash
npm install
```

Core scripts:

| Script       | Command              | Purpose                                                              |
| ------------ | -------------------- | -------------------------------------------------------------------- |
| `build`      | `npm run build`      | Clean, compile, validate instructions, copy assets, chmod executable |
| `dev`        | `npm run dev`        | TypeScript watch mode                                                |
| `dev:run`    | `npm run dev:run`    | Run built server with `.env` and file watch                          |
| `start`      | `npm run start`      | Start built server                                                   |
| `test`       | `npm run test`       | Full build + tests via task runner                                   |
| `test:fast`  | `npm run test:fast`  | Run TS tests directly with Node test runner                          |
| `lint`       | `npm run lint`       | ESLint checks                                                        |
| `lint:fix`   | `npm run lint:fix`   | ESLint auto-fix                                                      |
| `type-check` | `npm run type-check` | Strict TypeScript checks                                             |
| `format`     | `npm run format`     | Prettier format                                                      |
| `inspector`  | `npm run inspector`  | Build and open MCP Inspector against stdio server                    |

Inspect with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Build & Release

GitHub Actions release workflow (`.github/workflows/release.yml`) handles versioning, validation, and publishing via a single `workflow_dispatch` trigger:

```
workflow_dispatch (patch / minor / major / custom)
    │
    ▼
  release — bump package.json + server.json → lint → type-check → test → build → tag → GitHub Release
    │
    ├──► publish-npm ──► publish-mcp   (npm Trusted Publishing OIDC → MCP Registry)
    │
    └──► publish-docker                (GHCR, linux/amd64 + linux/arm64)
```

Trigger a release:

```bash
gh workflow run release.yml -f bump=patch
```

Or use the GitHub UI: **Actions → Release → Run workflow**.

> [!NOTE]
> npm publishing uses OIDC Trusted Publishing — no `NPM_TOKEN` secret required. MCP Registry uses GitHub OIDC. Docker uses the built-in `GITHUB_TOKEN`.

## Troubleshooting

| Symptom                       | Cause                        | Fix                                                      |
| ----------------------------- | ---------------------------- | -------------------------------------------------------- |
| Startup fails with FTS5 error | Node.js build without FTS5   | Use Node.js 24+ with SQLite FTS5 support                 |
| `E_NOT_FOUND` on `get_memory` | Hash doesn't exist           | Verify via `search_memories` first                       |
| `E_INVALID_CURSOR`            | Stale or malformed cursor    | Retry the request without the `cursor` parameter         |
| MCP client can't connect      | Custom stdout logging added  | Ensure nothing writes to stdout in the server process    |
| `aborted: true` in recall     | Traversal hit a safety limit | Reduce `depth`, or tune `RECALL_MAX_*` env vars          |
| Database locked errors        | High concurrent write load   | SQLite busy timeout is 5000 ms; reduce concurrent writes |

## License

MIT

<!-- markdownlint-enable MD033 -->
