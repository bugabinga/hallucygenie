# Task: HG-002 — Project Scaffold

**Created:** 2026-04-16
**Size:** S

## Review Level: 0 (None)

**Assessment:** Boilerplate scaffold, no logic.
**Score:** 0/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 0

## Canonical Task Folder

```
Tasks/HG-002-project-scaffold/
├── PROMPT.md
├── STATUS.md
└── .DONE
```

## Mission

Set up the HallucyGenie project scaffold: Bun package, file structure, TypeScript
config, environment handling, and Podman quadlet config. No application logic yet —
just the skeleton that subsequent tasks build on.

HallucyGenie is a kid-friendly AI chat app. It proxies MiniMax APIs (chat, TTS,
image gen, music gen) through a Bun backend with a mobile-first web frontend.
Tech: Bun, TypeScript, no frameworks, no OOP, no overengineering.

## Dependencies

- **None**

## Context to Read First

- `Tasks/CONTEXT.md` — project overview and tech choices

## Environment

- **Workspace:** Project root
- **Services required:** None

## File Scope

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `server.ts` (empty skeleton)
- `agent.ts` (empty skeleton)
- `tools.ts` (empty skeleton)
- `db.ts` (empty skeleton)
- `public/index.html` (empty placeholder)
- `public/app.ts` (empty placeholder)
- `public/style.css` (empty placeholder)
- `Dockerfile`
- `hallucygenie.container`

## Steps

### Step 0: Preflight

- [ ] Verify this PROMPT.md is readable
- [ ] Verify STATUS.md exists in the same folder

### Step 1: Package and TypeScript Config

- [ ] Create `package.json` with Bun, name "hallucygenie", type "module"
- [ ] Create `tsconfig.json` targeting ESNext, strict mode, Bun types
- [ ] Create `.gitignore` ignoring `node_modules/`, `.env`, `*.db`, `data/`

### Step 2: Server Skeleton

- [ ] Create `server.ts` with a `Bun.serve()` that returns 404 on all routes
- [ ] Server must read `PORT` from env, default 3000
- [ ] Console.log the port on startup

### Step 3: Empty Module Files

- [ ] Create `agent.ts` with a comment `// agent loop — HG-003`
- [ ] Create `tools.ts` with a comment `// tool definitions — HG-004`
- [ ] Create `db.ts` with a comment `// SQLite persistence — HG-004`

### Step 4: Frontend Placeholders

- [ ] Create `public/index.html` with minimal HTML5 boilerplate, viewport meta for mobile
- [ ] Create `public/app.ts` with a comment `// frontend — HG-005`
- [ ] Create `public/style.css` with a comment `/* styles — HG-005 */`

### Step 5: Container Config

- [ ] Create `Dockerfile` using `oven/bun:1` base, copying source, exposing port 3000
- [ ] Create `hallucygenie.container` quadlet file:
  - Image from local build
  - Publish port 3000
  - Volume mount for `data/` directory (SQLite)
  - Environment file `.env` for API keys
  - Auto-update label

### Step 6: Verification

- [ ] Run `bun install` — must succeed with zero errors
- [ ] Run `bun run server.ts` — must start and log port
- [ ] `curl localhost:3000` — must return 404
- [ ] Kill the server

## Documentation Requirements

**Must Update:** None
**Check If Affected:** `Tasks/CONTEXT.md` (already updated)

## Completion Criteria

- [ ] `bun install` succeeds
- [ ] `bun run server.ts` starts and serves 404
- [ ] All files listed in File Scope exist
- [ ] Dockerfile builds with `podman build`

## Git Commit Convention

- **Implementation:** `feat(HG-002): project scaffold`
- **Checkpoints:** `checkpoint: HG-002 description`

## Do NOT

- Add any application logic
- Add any npm dependencies beyond what Bun provides
- Use any framework
- Create classes or OOP patterns
- Over-engineer the file structure

---

## Amendments (Added During Execution)

<!-- Workers add amendments here if issues discovered during execution. -->
