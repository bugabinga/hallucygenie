# Task: HG-002 — Project Scaffold + Build System + Test Infra

**Created:** 2026-04-16
**Size:** S

## Review Level: 0 (None)

**Assessment:** Boilerplate scaffold and tooling setup, no application logic.
**Score:** 0/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 0

## Canonical Task Folder

```
Tasks/HG-002-project-scaffold/
├── PROMPT.md
├── STATUS.md
└── .DONE
```

## Mission

Set up the HallucyGenie project: Bun package, file structure, TypeScript config,
justfile (build system), and complete test infrastructure. No application logic —
just the skeleton that subsequent tasks build on.

The justfile is the **single source of truth** for all build-related commands.
Every agent and developer must use it. Recipes should be self-describing and
optimized for LLM invocation (clear names, doc comments, no ambiguity).

## Dependencies

- **None**

## Context to Read First

- `Tasks/CONTEXT.md` — project overview and tech choices

## Environment

- **Workspace:** Project root
- **Services required:** None
- **Note:** `just` v1.49.0 is already installed on this system. Bun needs to be installed.

## File Scope

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `justfile`
- `server.ts` (empty skeleton with placeholder test)
- `agent.ts` (empty skeleton with placeholder test)
- `tools.ts` (empty skeleton with placeholder test)
- `db.ts` (empty skeleton with placeholder test)
- `public/index.html` (empty placeholder)
- `public/app.ts` (empty placeholder)
- `public/style.css` (empty placeholder)
- `Dockerfile`
- `hallucygenie.container`
- `*.test.ts` files for each module

## Steps

### Step 0: Preflight

- [ ] Verify this PROMPT.md is readable
- [ ] Verify STATUS.md exists in the same folder
- [ ] Verify `just` is available (`just --version`)
- [ ] Install Bun if not present (follow instructions at bun.sh, use the official install script)

### Step 1: Package and TypeScript Config

- [ ] Create `package.json` with Bun, name "hallucygenie", type "module"
- [ ] Add devDependencies: `@happy-dom/global-registrator` (for DOM testing)
- [ ] Create `tsconfig.json` targeting ESNext, strict mode, Bun types
- [ ] Create `.gitignore` ignoring `node_modules/`, `.env`, `*.db`, `data/`, `.stryker-tmp/`, `reports/`

### Step 2: Justfile — Build System

- [ ] Create `justfile` with these recipes (all with doc comments):

```
# Install dependencies
install:
    bun install

# Run the dev server
dev:
    bun run --watch server.ts

# Build the production binary
build:
    bun build --compile --minify server.ts --outfile hallucygenie

# Run all unit tests
test:
    bun test

# Run unit tests with coverage report (100% target)
test-coverage:
    bun test --coverage

# Run mutation tests
test-mutation:
    bunx stryker run

# Run snapshot tests specifically
test-snapshot:
    bun test --test-name-pattern "snapshot"

# Run UI/E2E tests with Playwright
test-e2e:
    PLAYWRIGHT_ALLOW_ANDROID=1 bunx playwright test

# Run all tests (unit + mutation + snapshot + e2e)
test-all: test test-mutation test-snapshot test-e2e

# Clean build artifacts
clean:
    rm -rf hallucygenie node_modules/.cache .stryker-tmp reports

# Build the container image
container:
    podman build -t hallucygenie .
```

- [ ] Verify `just --list` shows all recipes
- [ ] Run `just install` — must succeed

### Step 3: Test Infrastructure

- [ ] Create `bunfig.toml` with test configuration:
  - `coverage` enabled, reporter: text + html
  - coverage threshold: 100% lines, 100% functions, 100% branches
  - test timeout: 30s
  - preload: `./test-setup.ts`
- [ ] Create `test-setup.ts` — empty for now, will be extended by later tasks
- [ ] Create `stryker.conf.json` with Bun runner config:
  - Target all `*.ts` files except `*.test.ts` and `node_modules/`
  - Use `stryker-mutator-bun-runner`
  - Mutators: arithmetic, boolean, conditional, string, array
  - Thresholds: high 90, low 80, break 70
- [ ] Create placeholder test files: `server.test.ts`, `agent.test.ts`, `tools.test.ts`, `db.test.ts`
  - Each with a single `describe` and a passing `it` placeholder
- [ ] Run `just test` — all placeholders pass
- [ ] Run `just test-coverage` — coverage report generates (won't be 100% yet, that's fine for scaffold)

### Step 4: Server Skeleton

- [ ] Create `server.ts` with a `Bun.serve()` that returns 404 on all routes
- [ ] Server must read `PORT` from env, default 3000
- [ ] Console.log the port on startup
- [ ] Export the server creation function (not auto-start) so tests can control lifecycle

### Step 5: Empty Module Files

- [ ] Create `agent.ts` with a comment `// agent loop — HG-003`
- [ ] Create `tools.ts` with a comment `// tool definitions — HG-004`
- [ ] Create `db.ts` with a comment `// SQLite persistence — HG-004`

### Step 6: Frontend Placeholders

- [ ] Create `public/index.html` with minimal HTML5 boilerplate, viewport meta for mobile
- [ ] Create `public/app.ts` with a comment `// frontend — HG-005`
- [ ] Create `public/style.css` with a comment `/* styles — HG-005 */`

### Step 7: Container Config

- [ ] Create `Dockerfile` using `oven/bun:1` base, copying source, exposing port 3000
- [ ] Create `hallucygenie.container` quadlet file:
  - Image from local build
  - Publish port 3000
  - Volume mount for `data/` directory (SQLite)
  - Environment file `.env` for API keys
  - Auto-update label

### Step 8: Verification

- [ ] `just install` — succeeds
- [ ] `just test` — all placeholder tests pass
- [ ] `just test-coverage` — generates coverage report
- [ ] `just dev` — server starts and logs port (kill after verify)
- [ ] `curl localhost:3000` — returns 404
- [ ] `just --list` — shows all recipes

## Documentation Requirements

**Must Update:** None
**Check If Affected:** `Tasks/CONTEXT.md` (already updated)

## Completion Criteria

- [ ] `just install` succeeds
- [ ] `just test` passes
- [ ] `just test-coverage` generates report
- [ ] `just dev` starts server that returns 404
- [ ] All files listed in File Scope exist
- [ ] `justfile` has all listed recipes
- [ ] Bun is installed and functional

## Git Commit Convention

- **Implementation:** `feat(HG-002): project scaffold with justfile and test infra`
- **Checkpoints:** `checkpoint: HG-002 description`

## Do NOT

- Add any application logic beyond the 404 server skeleton
- Use any framework
- Create classes or OOP patterns
- Over-engineer the file structure
- Install Playwright yet (that's HG-005 scope)

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
