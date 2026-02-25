# AGENTS.md

A SQLite-backed MCP server for persistent memory storage, full-text retrieval, and relationship graph traversal.

## Tooling

- **Manager**: npm
- **Frameworks**: TypeScript, @modelcontextprotocol/sdk, Zod, ESLint, Prettier

## Commands

- **Dev**: `npm run dev` (watch TypeScript), `npm run dev:run` (run built server with watch)
- **Test**: `npm run test` (`npm run test:coverage` for coverage)
- **Lint**: `npm run lint`
- **Deploy**: N/A

## Safety Boundaries

- **Always**: `npm run lint`; `npm run type-check`; `npm run test`; file-scoped formatting/lint fixes
- **Ask First**: `npm run build`; `npm run test:coverage`; dependency install/update; deleting files; release/publish/tag workflows; Docker/GitHub Actions changes
- **Never**: commit or expose `.tmp/mcp-cli.env`; edit generated/vendor directories (`dist/`, `node_modules/`, `.git/`); modify OAuth credential-related docs or release config without approval

## Directory Overview

```text
.
├── src/                    # MCP server source code
│   ├── index.ts            # CLI entry point
│   ├── server.ts           # MCP server wiring
│   ├── tools/              # Tool handlers
│   ├── schemas/            # Zod input/output schemas
│   ├── resources/          # MCP resources
│   ├── prompts/            # MCP prompts
│   ├── db/                 # SQLite access layer
│   ├── lib/                # Shared utilities
│   ├── completions/        # Completion handlers
│   └── __tests__/          # Node test suites
├── scripts/                # Task runner scripts
├── assets/                 # Static assets
├── memory_db/              # Local database files
├── package.json            # Scripts and dependencies
├── README.md               # Project docs
├── server.json             # Server/package metadata
├── Dockerfile              # Container build
└── docker-compose.yml      # Local container orchestration
```

## Navigation

- **Entry Points**: `src/index.ts`, `src/server.ts`, `README.md`, `package.json`, `docker-compose.yml`
- **Key Configs**: `tsconfig.json`, `tsconfig.build.json`, `tsconfig.test.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`

## Don'ts

- Don't bypass lint/type-check rules without approval.
- Don't ignore failing tests in CI or local verification.
- Don't add unapproved third-party packages.
- Don't hardcode secrets or credentials.
- Don't commit `.tmp/mcp-cli.env` or similar secret-bearing env files.
- Don't edit generated output in `dist/` or vendored dependencies in `node_modules/`.
- Don't run release/publish/tag operations without approval.

## Change Checklist

1. Run `npm run lint` and `npm run type-check`.
2. Run `npm run test` (and `npm run build` when behavior or packaging changes).
