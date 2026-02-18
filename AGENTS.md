# AGENTS.md

> Purpose: High-signal context and strict guidelines for AI agents working in this repository.

## 1) Project Context

- **Domain:** MCP server for storing, searching, and graph-traversing persistent memory entries backed by SQLite and exposed as MCP tools (see `package.json`, `src/server.ts`, `src/tools/recall.ts`).
- **Tech Stack (Verified):**
  - **Languages:** TypeScript (see `package.json`, `tsconfig.json`), JavaScript for build/task scripts (see `scripts/tasks.mjs`).
  - **Frameworks:** Model Context Protocol SDK server (`@modelcontextprotocol/sdk`) and Zod v4 schemas (see `package.json`, `src/server.ts`, `src/schemas/inputs.ts`).
  - **Key Libraries:** `@modelcontextprotocol/sdk`, `zod`, `typescript`, `eslint`, `prettier` (see `package.json`).
- **Architecture:** Single-package MCP server with layered modules: entrypoint/transport, server composition, per-tool registration, schema definitions, DB wrapper, and shared lib helpers (see `src/index.ts`, `src/server.ts`, `src/tools/index.ts`, `src/schemas/inputs.ts`, `src/db/typed.ts`, `src/lib/tool-response.ts`).

## 2) Repository Map (High-Level)

- `src/`: Core MCP implementation (server setup, tools, schemas, resources/prompts, DB + libs) (see `src/server.ts`, `src/tools/index.ts`).
- `src/__tests__/`: Node test suite for tools and DB/helpers (see `src/__tests__/recall.test.ts`, `src/__tests__/db.test.ts`).
- `scripts/`: Build/type-check/test task runner script used by npm scripts (see `scripts/tasks.mjs`, `package.json`).
- `.github/`: Agent/instruction/prompt metadata; no workflow files currently present as command source of truth (see `.github/`, no matches for `.github/workflows/*.yml` or `.yaml`).
  > Ignore generated/vendor dirs like `dist/`, `build/`, `node_modules/`, `.venv/`, `__pycache__/`.

## 3) Operational Commands (Verified)

- **Environment:** Node.js >= 24 with npm (see `package.json` `engines.node`, `package-lock.json`).
- **Install:** **UNVERIFIED** — no CI workflow or README install step found; package manager is npm by lockfile evidence (see `package-lock.json`, `README.md` is empty).
- **Dev:** `npm run dev` (TypeScript watch) and `npm run dev:run` (run built server with `.env`) (see `package.json`).
- **Test:** `npm test` (delegates to scripted build+test pipeline), or targeted `npm run test:fast` for `src/__tests__/**/*.test.ts` (see `package.json`, `scripts/tasks.mjs`).
- **Build:** `npm run build` (clean, compile, validate instructions, copy assets, chmod executable) (see `package.json`, `scripts/tasks.mjs`).
- **Lint/Format:** `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run type-check` (see `package.json`).

## 4) Coding Standards (Style & Patterns)

- **Naming:** Enforced camelCase/PascalCase conventions and TypeScript-focused lint rules via ESLint config (see `eslint.config.mjs`).
- **Structure:** Entrypoint wires stdio transport + shutdown; server composes capabilities and registers tools/resources/prompts; each tool in its own module (see `src/index.ts`, `src/server.ts`, `src/tools/index.ts`).
- **Typing/Strictness:** TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, `verbatimModuleSyntax` (see `tsconfig.json`); lint enforces explicit return types and no `any` (see `eslint.config.mjs`).
- **Patterns Observed:**
  - Typed SQLite wrapper to provide generic row typing over `DatabaseSync.prepare<T>()` (observed in `src/db/typed.ts`).
  - Tool handlers return structured success/error envelopes via shared helpers instead of throwing uncaught errors (observed in `src/tools/recall.ts`, `src/lib/tool-response.ts`).
  - Input validation via `z.strictObject()` schemas with explicit bounds and descriptions (observed in `src/schemas/inputs.ts`).
  - BFS traversal guard limits frontier size to prevent unbounded expansion (observed in `src/tools/recall.ts`).

## 5) Agent Behavioral Rules (Do Nots)

- Do not introduce new dependencies without updating npm manifests/lockfiles through the package manager (see `package.json`, `package-lock.json`).
- Do not write long comments or jsdocs, keep comments short, simpel and one line.
- Do not edit lockfiles manually (see `package-lock.json` presence).
- Do not commit secrets; never print `.env` values or MCP registry tokens (see `.gitignore` entries for `.env*` and `.mcpregistry_*`).
- Do not change tool contracts/schemas without updating related tests in `src/__tests__/` (see `src/schemas/inputs.ts`, `src/__tests__/recall.test.ts`).
- Do not remove the executable CLI shebang from the MCP entrypoint (see first line of `src/index.ts`).
- Do not disable or bypass existing lint/type checks without explicit approval (see `eslint.config.mjs`, `tsconfig.json`, `package.json` scripts).

## 6) Testing Strategy (Verified)

- **Framework:** Node built-in test runner (`node:test`) with TS execution via `tsx/esm` in fast path (see `src/__tests__/recall.test.ts`, `package.json` `test:fast`, `scripts/tasks.mjs`).
- **Where tests live:** Primarily `src/__tests__/` (`*.test.ts`); pipeline also checks optional `tests/**/*.test.ts` when directory exists (see `scripts/tasks.mjs`, `src/__tests__/`).
- **Approach:** Tool-level integration-style tests instantiate the MCP server and call tools directly; DB-dependent tests use in-memory SQLite (`:memory:`) and helper invocations (see `src/__tests__/recall.test.ts`, `src/__tests__/helpers.ts`).

## 7) Common Pitfalls (Optional; Verified Only)

- Missing `src/instructions.md` breaks the build validation step in task pipeline → keep that file present during refactors (see `scripts/tasks.mjs`, `src/instructions.md`).
- Build/test tasks require TypeScript compiler and test loader dependencies from `node_modules` (`typescript`, `tsx`/`ts-node`) → run dependency install before build/test (see `scripts/tasks.mjs`, `package.json`).

## 8) Evolution Rules

- If conventions change, include an `AGENTS.md` update in the same PR.
- If a command is corrected after failures, record the final verified command here.
- If a new critical path or pattern is discovered, add it to the relevant section with evidence.
