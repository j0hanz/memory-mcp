# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** SQLite-backed MCP server for persistent memory storage, search, and graph recall (see `README.md`, `package.json`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript 5.9.3, Node.js >=24 (see `package.json`).
  - **Frameworks:** MCP SDK (`@modelcontextprotocol/sdk`) (see `package.json`).
  - **Key Libraries:** `zod` (v4), `node:sqlite` (built-in) (see `package.json`, `src/db/index.ts`).
- **Architecture:** Modular MCP server with explicit entrypoint, server composition, and SQLite persistence layer (see `src/index.ts`, `src/server.ts`, `src/db/index.ts`).

## 2) Repository Map (High-Level)

- `src/`: Core server code (entrypoint, server composition, tools, schemas, db) (see `src/index.ts`).
- `src/db/`: Database initialization, migrations, and TypedDb wrapper (see `src/db/index.ts`).
- `src/tools/`: MCP tool definitions and handlers (see `src/tools/index.ts`).
- `src/schemas/`: Zod schemas for tool inputs and outputs (see `src/schemas/`).
- `src/__tests__/`: Unit and integration tests using `node:test` (see `src/__tests__/`).
- `scripts/`: Task orchestration for build and test pipelines (see `scripts/tasks.mjs`).
- `.github/workflows/`: CI/CD automation (see `.github/workflows/release.yml`).
  > Ignore generated/vendor dirs like `dist/`, `build/`, `node_modules/`.

## 3) Operational Commands (Verified)

- **Environment:** Node.js >=24 (see `package.json` engines).
- **Install:** `npm install` (see `package-lock.json`).
- **Dev:** `npm run dev` (TypeScript watch) or `npm run dev:run` (run with watch) (see `package.json`).
- **Test:** `npm run test` (full build + tests) or `npm run test:fast` (targeted tests) (see `package.json`, `scripts/tasks.mjs`).
- **Build:** `npm run build` (clean, compile, validate, assets, chmod) (see `package.json`, `scripts/tasks.mjs`).
- **Lint/Format:** `npm run lint`, `npm run format`, `npm run type-check` (see `package.json`).

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase default, PascalCase for types (see `eslint.config.mjs`).
- **Structure:**
  - Entrypoint (`src/index.ts`) manages process and transport.
  - Server factory (`src/server.ts`) registers tools and resources.
  - Database (`src/db/index.ts`) handles schema and migrations.
- **Typing/Strictness:** Strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (see `tsconfig.json`).
- **Patterns Observed:**
  - `TypedDb` wrapper for type-safe SQLite interaction (observed in `src/db/index.ts`, `src/tools/store-memory.ts`).
  - `wrapToolHandler` for consistent progress reporting (observed in `src/tools/store-memory.ts`).
  - `prepareOnce` for SQLite statement caching (observed in `src/tools/store-memory.ts`).
  - Zod v4 for schema validation (observed in `src/tools/store-memory.ts`).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and lockfiles via npm. (see `package.json`)
- Do not edit lockfiles manually. (see `package-lock.json`)
- Do not commit secrets; use environment variables or config files.
- Do not change public tool APIs without updating tests and docs.
- Do not disable or bypass existing lint/type rules without explicit approval. (see `eslint.config.mjs`)

## 6) Testing Strategy (Verified)

- **Framework:** `node:test` (see `src/__tests__/store-memory.test.ts`).
- **Where tests live:** `src/__tests__/*.test.ts` (see `src/__tests__/`).
- **Approach:**
  - Unit tests use in-memory SQLite (`:memory:`) for isolation (observed in `src/__tests__/store-memory.test.ts`).
  - `callTool` helper used to invoke and verify tool behavior (observed in `src/__tests__/store-memory.test.ts`).

## 7) Common Pitfalls (Optional; Verified Only)

- **FTS5 Requirement:** The server requires a Node.js SQLite build with FTS5 support (observed in `src/db/index.ts` `assertFts5Available`).

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
