# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** SQLite-backed MCP server for persistent memory storage, search, and graph recall (see `README.md`, `package.json`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript (see `package.json` devDependency `typescript`, `src/**/*.ts`).
  - **Frameworks:** MCP server SDK (`@modelcontextprotocol/sdk`) with Zod schemas (see `package.json` dependencies, `src/server.ts`, `src/schemas/inputs.ts`).
  - **Key Libraries:** `@modelcontextprotocol/sdk`, `zod`, Node built-in `node:sqlite` (see `package.json`, `src/db/index.ts`).
- **Architecture:** Modular MCP server with explicit entrypoint, server composition, tool/resource/prompt registrars, and SQLite persistence layer (see `src/index.ts`, `src/server.ts`, `src/tools/index.ts`, `src/resources/index.ts`, `src/prompts/index.ts`, `src/db/index.ts`).

## 2) Repository Map (High-Level)

- `src/`: Core server code (entrypoint, server composition, tools, schemas, db, resources, prompts) (see `src/index.ts`, `src/server.ts`, `src/tools/`, `src/db/`).
- `src/__tests__/`: Node test runner suites for tool/database behavior (see `src/__tests__/*.test.ts`).
- `scripts/`: Task orchestration for build/type-check/test pipelines (see `scripts/tasks.mjs`).
- `.github/`: Repository-local prompt, instruction, and agent reference docs (see `.github/prompts/`, `.github/instructions/`, `.github/agents/`).
- `assets/`: Static assets copied into build output (see `assets/logo.svg`, `scripts/tasks.mjs`).
  > Ignore generated/vendor dirs like `dist/`, `build/`, `node_modules/`, `.venv/`, `__pycache__/`.

## 3) Operational Commands (Verified)

- **Environment:** Node.js `>=24` (see `package.json` `engines.node`); stdio MCP server process (see `src/index.ts`, `README.md`).
- **Install:** `npm install` (see `README.md` Development section, `package-lock.json`).
- **Dev:** `npm run dev` (TypeScript watch) / `npm run dev:run` (run built server with watch) (see `package.json` scripts).
- **Test:** `npm run test:fast` for targeted test runs; `npm run test` for full build+tests (see `package.json` scripts, `scripts/tasks.mjs`).
- **Build:** `npm run build` (clean, compile, validate instructions, copy assets, chmod) (see `package.json`, `scripts/tasks.mjs`).
- **Lint/Format:** `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run type-check` (see `package.json` scripts).

## 4) Coding Standards (Style & Patterns)

- **Naming:** camelCase defaults, PascalCase for type-like symbols, import naming constraints via ESLint naming convention (see `eslint.config.mjs`).
- **Structure:** Entrypoint (`src/index.ts`) initializes DB + server + stdio transport; server composition registers tools/resources/prompts centrally (see `src/index.ts`, `src/server.ts`).
- **Typing/Strictness:** TypeScript strict mode with `noUncheckedIndexedAccess`, `isolatedModules`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes` (see `tsconfig.json`); explicit return types and strict ESLint TypeScript rules (see `eslint.config.mjs`).
- **Patterns Observed:**
  - Tool registration uses Zod input/output schemas plus standardized response helpers (`createToolResponse` / `createErrorResponse`) (observed in `src/tools/store-memory.ts`).
  - Database bootstrapping verifies FTS5 availability and applies full schema+indexes at startup (observed in `src/db/index.ts`).
  - Database startup applies schema-versioned migrations via `PRAGMA user_version` (observed in `src/db/index.ts`).
  - Recall traversal uses bounded BFS safeguards (`MAX_FRONTIER_SIZE`, `MAX_EDGE_ROWS`, `MAX_VISITED_NODES`) with abort signaling (observed in `src/tools/recall.ts`).
  - Import ordering and formatting are enforced by Prettier + import-sort plugin (see `.prettierrc`, `package.json`).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating `package.json` and regenerating `package-lock.json` via npm (see `package.json`, `package-lock.json`).
- Do not edit lockfiles manually (lockfile is present and npm is the package manager of record) (see `package-lock.json`).
- Do not commit secrets; avoid printing runtime secrets; keep fatal logging on stderr for CLI safety (see `src/index.ts`, `README.md` stdio/troubleshooting notes).
- Do not change public tool APIs (names/schemas/output contracts) without updating tests and docs (see `src/tools/*.ts`, `src/schemas/*.ts`, `README.md` MCP Surface).
- Do not disable or bypass existing lint/type rules without explicit approval (see `eslint.config.mjs`, `tsconfig.json`).
- Do not remove the CLI shebang or stdio transport wiring from the entrypoint (see `src/index.ts`, `package.json` `bin`).

## 6) Testing Strategy (Verified)

- **Framework:** Node test runner (`node:test`) with TS execution via `tsx/esm` in fast path (see `src/__tests__/store-memory.test.ts`, `package.json` script `test:fast`, `scripts/tasks.mjs`).
- **Where tests live:** `src/__tests__/*.test.ts` (see `src/__tests__/`).
- **Approach:** Tool-level tests exercise registered MCP handlers with in-memory SQLite (`:memory:`) via direct tool invocation helpers (see `src/__tests__/store-memory.test.ts`, `src/__tests__/helpers.ts`).
- **Integration coverage:** Protocol-level e2e tests run client↔server flows through `InMemoryTransport` (see `src/__tests__/protocol-e2e.test.ts`).
- **Build coupling:** Full `npm run test` pipeline performs build stages before running tests (see `scripts/tasks.mjs` `TestTasks.test` + `Pipeline.fullBuild`).
- **Additional discovery:** Test runner also looks for `tests/**/*.test.ts` when a `tests/` directory exists (see `scripts/tasks.mjs` `CONFIG.test.patterns` + `findTestPatterns`).
- **UNVERIFIED:** Dedicated external-system e2e suite (network/process-bound) — no separate folder/workflow evidence found.

## 7) Common Pitfalls (Optional; Verified Only)

- Missing `src/instructions.md` breaks the build validation step in task pipeline → keep that file present during refactors (see `scripts/tasks.mjs` `BuildTasks.validate`, `src/instructions.md`).
- SQLite build without FTS5 support causes startup failure → use Node/SQLite build with FTS5 support (see `src/db/index.ts`, `README.md` Troubleshooting).
- Large graph traversals can explode memory/time → retain traversal bounds and env-based limits in recall tool (see `src/tools/recall.ts`).

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
