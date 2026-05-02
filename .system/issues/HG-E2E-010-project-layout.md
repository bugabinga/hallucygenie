# HG-E2E-010: Project layout is a mess

**Status:** Fixed

**Severity:** Medium (DX)
**Observed:** Root directory has 30+ files/dirs. Source, tests, tooling config, deploy config, scratch files, and build artifacts all mixed together. Compare with `particles/` (3 dirs + 3 files at root) or `chef/` (Cargo.toml + src/).

**Current root:**

```
AGENTS.md, agent.ts, agent.test.ts, server.ts, server.test.ts, tools.ts, tools.test.ts,
db.ts, db.test.ts, log.ts, integration.test.ts
stryker.config.mjs, stryker-db.mjs, stryker-tools.mjs
playwright.config.ts, Dockerfile, hallucygenie.container
ideas.md, .pulse.json, test-data-steer/
public/, e2e/, migrations/, docs/, data/, logs/
justfile, package.json, tsconfig.json, bun.lock
.gitignore, .prettierrc, .prettierignore, .system/
```

**Problems:**

1. Source files (`*.ts`) and test files (`*.test.ts`) interleaved in root
2. Tooling configs (stryker, playwright) in root
3. Deploy files (Dockerfile, container) in root
4. Scratch file (`ideas.md`) tracked in git
5. Build artifact (`public/app.js`) tracked in git
6. `.pulse.json` (IDE artifact) tracked in git
7. `test-data-steer/` not gitignored
8. No `src/` directory — everything flat

**Proposed layout:**

```
src/              — server.ts, agent.ts, tools.ts, db.ts, log.ts
public/           — index.html, app.ts, style.css, markdown.ts, snapshots/
test/             — *.test.ts, integration.test.ts, stryker*.mjs, playwright.config.ts
e2e/              — E2E specs (unchanged)
migrations/       — SQL files (unchanged)
deploy/           — Dockerfile, hallucygenie.container
docs/             — research, API docs (unchanged)
.system/          — issues (unchanged)
AGENTS.md, justfile, package.json, tsconfig.json, bun.lock
.gitignore, .prettierrc, .prettierignore
```

**Key changes:**

- `src/` for all server-side source
- `test/` for all test files and test tooling config
- `deploy/` for Dockerfile and container files
- `public/app.js` → gitignored (rebuilt by `just build`)
- `ideas.md` → gitignored or deleted
- `.pulse.json` → gitignored
- `test-data*` → gitignored (already partially is)
