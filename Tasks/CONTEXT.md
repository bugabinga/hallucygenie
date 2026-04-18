# General — Context

**Last Updated:** 2026-04-18
**Status:** Active
**Next Task ID:** HG-010

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

## Technical Debt / Future Work

_Items discovered during task execution are logged here by agents._

- [ ] **Playwright platform patches** — `playwright-core` registry files patched for Android
- [ ] **Stryker mutation testing** — agent.ts and server.ts too large for this device (OOM)
- [ ] **Bun was abandoned** — Bun doesn't support Android/Termux, switched to Node.js
