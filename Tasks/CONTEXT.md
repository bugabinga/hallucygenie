# General — Context

**Last Updated:** 2026-04-18
**Status:** Active
**Next Task ID:** HG-020

---

## Current State

HallucyGenie is a kid-friendly AI chat app for an 11-year-old gaming YouTuber.
It proxies MiniMax APIs (chat, TTS, image gen, music gen) through a Node.js backend
with a mobile-first web frontend.

**Tech stack:** Node.js (TypeScript), vanilla HTML/CSS/TS frontend, SQLite,
Podman quadlet deployment.

**No frameworks. No OOP. No overengineering.** Plain functions, plain objects.

Taskplane is configured and ready for task execution. Use `/orch all` for
parallel batch execution or `/orch <path/to/PROMPT.md>` for a single task.

---

## Key Files

| Category | Path |
|----------|------|
| Tasks | `Tasks/` |
| Config | `.pi/taskplane-config.json` |
| Server | `server.ts` |
| Agent loop | `agent.ts` |
| Tools | `tools.ts` |
| Database | `db.ts` |
| Frontend | `public/` |
| Container | `Dockerfile`, `hallucygenie.container` |

---

## Test Coverage (as of 2026-04-18)

| File | Line % | Branch % | Func % |
|------|--------|----------|--------|
| agent.ts | 100% | 93.94% | 100% |
| db.ts | 100% | 96.67% | 100% |
| tools.ts | 100% | 100% | 100% |
| server.ts | 96.23% | 91.91% | 96.15% |
| public/app.ts | **37%** | 78.26% | 25% |

---

## Planned Tasks

| ID | Task | Size | Depends On | Batch |
|----|------|------|------------|-------|
| HG-010 | Anthropic endpoint migration | L | — | 3 (solo) |
| HG-011 | Prompt caching | S | HG-010 | 4 |
| HG-012 | Token-based context window | S | HG-010 | 4 |
| HG-013 | Quota API + usage badge | S | — | 4 |
| HG-018 | Media tools + forms UI | L | HG-010 | 5 (solo) |
| HG-019 | Asset persistence + gallery | M | HG-018 | 6 |
| HG-017 | First-run onboarding | M | HG-018 | 6 |

**Batch 3:** HG-010 (solo, foundational)
**Batch 4:** HG-011 + HG-012 + HG-013 (parallel, all small)
**Batch 5:** HG-018 (solo, wide but not deep)
**Batch 6:** HG-019 + HG-017 (parallel, both depend on HG-018)

## Technical Debt / Future Work

- [ ] **Playwright platform patches** — `playwright-core` registry files patched for Android
- [ ] **Stryker mutation testing** — agent.ts and server.ts too large for this device (OOM)
- [ ] **Bun was abandoned** — Bun doesn't support Android/Termux, switched to Node.js
