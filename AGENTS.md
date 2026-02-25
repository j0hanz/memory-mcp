# AGENTS.md

TypeScript MCP server for persistent SQLite-backed memory storage, retrieval, and relationship traversal over stdio.

## Tooling

- Package manager: `npm` (`package-lock.json` present).
- Runtime: Node.js `>=24`.
- Language: TypeScript (ESM, strict).

## Commands

- Fast test (single file): `node --test --import tsx/esm src/__tests__/<test-file>.test.ts`
- Fast test suite: `npm run test:fast`
- Full test pipeline (build + tests): `npm run test` _(expensive)_
- Type-check: `npm run type-check`
- Lint: `npm run lint`
- Build: `npm run build`
- Run built server: `npm run start`
- Inspector (build + inspector): `npm run inspector` _(expensive)_

## Safety and Permissions

### Always

- Keep stdio protocol clean: do not add non-protocol writes to stdout in runtime server paths.
- Prefer minimal, surgical edits in `src/` and update tests in `src/__tests__/` when behavior changes.
- Run focused verification first (`test:fast` or single test file), then broader checks only as needed.

### Ask First

- Dependency changes (`npm install`, `package.json` / `package-lock.json` updates).
- Release/versioning edits (`server.json`, `.github/workflows/release.yml`, publish flow).
- Database behavior changes that can affect compatibility or existing `memory_db/memory.db` data.
- Running heavy or long tasks repeatedly (`npm run test`, `npm run inspector`).

### Never

- Commit secrets, tokens, or credentials.
- Hand-edit generated build output under `dist/`.
- Modify CI/release automation semantics without explicit approval.

## Navigation

- Entrypoints: `src/index.ts`, `src/server.ts`
- Tool registration: `src/tools/index.ts`
- Tool implementations: `src/tools/*.ts`
- Schemas/contracts: `src/schemas/`, `src/lib/tool-contracts.ts`, `src/lib/tool-response.ts`
- DB layer: `src/db/`, `src/lib/sql.ts`, `src/lib/search.ts`
- Docs/source of truth for behavior: `README.md`, `src/resources/instructions.ts`

## Examples to Follow

- Good orchestration pattern: `src/tools/index.ts` (single registrar list).
- Good runtime entrypoint pattern: `src/index.ts` (shebang, shutdown, stderr error path).
- Good task orchestration pattern: `scripts/tasks.mjs` (centralized build/test tasks).
- Avoid copying from generated artifacts: `dist/*`.

## PR Checklist

- Commands used to validate changes are included in PR notes.
- Behavior changes include or update tests in `src/__tests__/`.
- MCP-facing changes keep docs aligned (`README.md` and instruction resources).
- No unrelated refactors or formatting-only churn.

## When Stuck

- Ask one focused clarifying question.
- Propose the smallest safe plan, then implement incrementally.
- Prefer existing patterns in neighboring files over introducing new abstractions.
