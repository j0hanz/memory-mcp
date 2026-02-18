# Memory MCP

<!-- markdownlint-disable MD033 -->

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://github.com/j0hanz/memory-mcp/blob/master/package.json) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://github.com/j0hanz/memory-mcp/blob/master/package.json) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9%2B-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/j0hanz/memory-mcp/blob/master/package.json)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemory-mcp%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memory-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemory-mcp%40latest%22%5D%7D&quality=insiders)

A SQLite-backed MCP server for persistent memory storage, full-text retrieval, and relationship graph traversal.

## Overview

Memory MCP provides a local, persistent memory layer for MCP-enabled assistants. It supports SHA-256-addressed memory items, FTS5-powered search, graph relationships, BFS recall, an `internal://instructions` resource, and a `get-help` prompt.

## Key Features

- 12 MCP tools for CRUD, batch operations, search, recall, relationships, and stats.
- Full-text search over content and tags via SQLite FTS5.
- Graph recall with BFS traversal and bounded frontier size.
- Strict Zod input validation with typed output envelopes.
- Resource support with URI-template completion for memory hashes.
- stdio transport with clean shutdown handling (`SIGINT`, `SIGTERM`).

## Requirements

- Node.js `>=24`.
- SQLite with FTS5 support (required at startup).
- Any MCP client that supports stdio command servers.

## Quick Start

Use the npm package directly with `npx`:

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
> The server uses stdio transport only; no HTTP endpoint is exposed.

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
<summary><b>Install in Cursor</b></summary>

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

## MCP Surface

### Tools Summary

| Tool                  | Category | Notes                                   |
| --------------------- | -------- | --------------------------------------- |
| `store_memory`        | Write    | Idempotent by content+sorted tags hash  |
| `store_memories`      | Write    | Batch (1-50), transaction-wrapped       |
| `get_memory`          | Read     | Hash lookup                             |
| `update_memory`       | Write    | Returns `old_hash` + `new_hash`         |
| `delete_memory`       | Write    | Cascades relationship deletion          |
| `delete_memories`     | Write    | Batch (1-50), transaction-wrapped       |
| `search_memories`     | Read     | FTS5 query + cursor pagination          |
| `create_relationship` | Write    | Idempotent edge creation                |
| `delete_relationship` | Write    | Deletes exact directed edge             |
| `get_relationships`   | Read     | Direction filter + linked memory fields |
| `recall`              | Read     | Search + BFS traversal (`depth` 0-3)    |
| `memory_stats`        | Read     | Store aggregates and type breakdown     |

### `store_memory`

Purpose: Store one memory and return its SHA-256 hash.

| Name          | Type       | Required | Default   | Description                                                                        |
| ------------- | ---------- | -------- | --------- | ---------------------------------------------------------------------------------- |
| `content`     | `string`   | Yes      | —         | Memory content (1-100000 chars)                                                    |
| `tags`        | `string[]` | Yes      | —         | 1-100 tags, each max 50, no whitespace                                             |
| `memory_type` | enum       | No       | `general` | `general`, `fact`, `plan`, `decision`, `reflection`, `lesson`, `error`, `gradient` |
| `importance`  | `integer`  | No       | `0`       | Priority 0-10                                                                      |

Returns: `{ ok, result: { hash, created } }`.

### `store_memories`

Purpose: Store multiple memories in one call (max 50 items).

| Name    | Type                     | Required | Default | Description                                                                                   |
| ------- | ------------------------ | -------- | ------- | --------------------------------------------------------------------------------------------- |
| `items` | `Array<StoreMemoryItem>` | Yes      | —       | 1-50 memory items, each with `content`, `tags`, optional `memory_type`, optional `importance` |

Returns: `{ ok, result: { items, succeeded, failed } }`.

### `get_memory`

Purpose: Retrieve one memory by hash.

| Name   | Type     | Required | Default | Description                   |
| ------ | -------- | -------- | ------- | ----------------------------- |
| `hash` | `string` | Yes      | —       | 64-char lowercase SHA-256 hex |

Returns: `{ ok, result: Memory }` or `{ ok: false, error }` (`E_NOT_FOUND`).

### `update_memory`

Purpose: Update content and optionally tags for an existing memory.

| Name      | Type       | Required | Default       | Description          |
| --------- | ---------- | -------- | ------------- | -------------------- |
| `hash`    | `string`   | Yes      | —             | Existing memory hash |
| `content` | `string`   | Yes      | —             | Replacement content  |
| `tags`    | `string[]` | No       | existing tags | Replacement tags     |

Returns: `{ ok, result: { old_hash, new_hash } }`.

### `delete_memory`

Purpose: Delete one memory by hash.

| Name   | Type     | Required | Default | Description |
| ------ | -------- | -------- | ------- | ----------- |
| `hash` | `string` | Yes      | —       | Memory hash |

Returns: `{ ok, result: { hash, deleted } }`.

### `delete_memories`

Purpose: Delete multiple memories by hash.

| Name     | Type       | Required | Default | Description        |
| -------- | ---------- | -------- | ------- | ------------------ |
| `hashes` | `string[]` | Yes      | —       | 1-50 memory hashes |

Returns: `{ ok, result: { items, succeeded, failed } }`.

### `search_memories`

Purpose: FTS5 search over content and tags with cursor pagination.

| Name     | Type      | Required | Default | Description                 |
| -------- | --------- | -------- | ------- | --------------------------- |
| `query`  | `string`  | Yes      | —       | Search text (1-1000 chars)  |
| `limit`  | `integer` | No       | `20`    | Result cap per page (1-100) |
| `cursor` | `string`  | No       | —       | Pagination cursor           |

Returns: `{ ok, result: { memories, total_returned, nextCursor? } }`.

### `create_relationship`

Purpose: Create a directed relationship between two memories.

| Name            | Type     | Required | Default | Description                            |
| --------------- | -------- | -------- | ------- | -------------------------------------- |
| `from_hash`     | `string` | Yes      | —       | Source memory hash                     |
| `to_hash`       | `string` | Yes      | —       | Target memory hash                     |
| `relation_type` | `string` | Yes      | —       | Edge label (1-50 chars, no whitespace) |

Returns: `{ ok, result: { created } }`.

### `delete_relationship`

Purpose: Delete one directed relationship edge.

| Name            | Type     | Required | Default | Description       |
| --------------- | -------- | -------- | ------- | ----------------- |
| `from_hash`     | `string` | Yes      | —       | Source hash       |
| `to_hash`       | `string` | Yes      | —       | Target hash       |
| `relation_type` | `string` | Yes      | —       | Relationship type |

Returns: `{ ok, result: { deleted } }` or `{ ok: false, error }` (`E_NOT_FOUND`).

### `get_relationships`

Purpose: Retrieve relationships for a memory, optionally filtered by direction.

| Name        | Type     | Required | Default | Description                       |
| ----------- | -------- | -------- | ------- | --------------------------------- |
| `hash`      | `string` | Yes      | —       | Memory hash                       |
| `direction` | enum     | No       | `both`  | `outgoing`, `incoming`, or `both` |

Returns: `{ ok, result: { relationships, count } }`.

### `recall`

Purpose: Search memories, then traverse connected graph edges up to `depth` hops.

| Name     | Type      | Required | Default | Description              |
| -------- | --------- | -------- | ------- | ------------------------ |
| `query`  | `string`  | Yes      | —       | Seed search query        |
| `depth`  | `integer` | No       | `1`     | BFS hops (0-3)           |
| `limit`  | `integer` | No       | `10`    | Seed memory count (1-50) |
| `cursor` | `string`  | No       | —       | Pagination cursor        |

Returns: `{ ok, result: { memories, graph, depth_reached, nextCursor? } }`.

### `memory_stats`

Purpose: Return aggregate memory and relationship stats.

| Name     | Type | Required | Default | Description        |
| -------- | ---- | -------- | ------- | ------------------ |
| _(none)_ | —    | —        | —       | Empty input object |

Returns: `{ ok, result: { memories, relationships, by_type } }`.

### Resources

| URI                        | Type            | Description                                           |
| -------------------------- | --------------- | ----------------------------------------------------- |
| `internal://instructions`  | Static resource | Markdown usage guide for all tools                    |
| `memory://memories/{hash}` | URI template    | Returns one memory as JSON; hash completion supported |

### Prompts

| Name       | Arguments | Purpose                                |
| ---------- | --------- | -------------------------------------- |
| `get-help` | none      | Returns memory tool usage instructions |

## Configuration

### Environment Variables

| Variable         | Description               | Default     | Required |
| ---------------- | ------------------------- | ----------- | -------- |
| `MEMORY_DB_PATH` | SQLite database file path | `memory.db` | No       |

### Limits and Constraints

| Item                    | Value                                            |
| ----------------------- | ------------------------------------------------ |
| Content length          | 1-100000 chars                                   |
| Tag count               | 1-100 per memory                                 |
| Tag length              | 1-50 chars, no whitespace                        |
| Hash format             | 64-char lowercase hex SHA-256                    |
| Search query length     | 1-1000 chars                                     |
| `search_memories.limit` | 1-100 (default 20)                               |
| `recall.depth`          | 0-3 (default 1)                                  |
| `recall.limit`          | 1-50 (default 10)                                |
| Batch size              | 1-50 items (`store_memories`, `delete_memories`) |
| Recall frontier guard   | Max 1000 nodes per hop                           |
| SQLite busy timeout     | 5000 ms                                          |

> [!NOTE]
> Cursor values are base64url-encoded offsets. Treat them as opaque tokens.

## Security

- Transport is stdio-only (`StdioServerTransport`), with no HTTP endpoints.
- Fatal process errors are written to `stderr` in the entrypoint.
- Inputs are validated with strict Zod schemas and bounded field constraints.
- Hashes are validated against lowercase SHA-256 hex format.
- FTS queries are sanitized to safe alphanumeric tokens before execution.
- SQLite foreign keys are enabled; relationship rows cascade on memory delete.

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
| `type-check` | `npm run type-check` | Strict TypeScript checks                                             |
| `inspector`  | `npm run inspector`  | Build and open MCP Inspector against stdio server                    |

Inspect with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

- If startup fails with FTS5 errors, use Node.js 24+ with SQLite FTS5 support.
- If a request fails with `E_INVALID_CURSOR`, retry without the cursor.
- If stdio clients fail to connect, ensure no custom stdout logging is added to the server process.
- If memory or relationship lookups fail, confirm hashes exist via `search_memories` first.

## License

- **MIT**

<!-- markdownlint-enable MD033 -->
