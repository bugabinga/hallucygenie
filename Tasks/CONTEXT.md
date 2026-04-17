# General — Context

**Last Updated:** 2026-04-16
**Status:** Active
**Next Task ID:** HG-008

---

## Current State

HallucyGenie is a kid-friendly AI chat app for an 11-year-old gaming YouTuber.
It proxies MiniMax APIs (chat, TTS, image gen, music gen) through a Bun backend
with a mobile-first web frontend.

**Tech stack:** Bun (TypeScript), vanilla HTML/CSS/TS frontend, SQLite,
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

## Technical Debt / Future Work

_Items discovered during task execution are logged here by agents._

- [ ] **Playwright platform patches** — `playwright-core` registry files patched for Android. Should upstream or use `PLAYWRIGHT_ALLOW_ANDROID` env when merged (discovered during HG-007)
- [ ] **app.js build step** — Frontend uses `app.ts` (Bun serves .ts directly), but E2E tests need transpiled `app.js`. Consider adding a pre-build hook (discovered during HG-007)
- [ ] **Stryker mutation testing** — Currently falls back to coverage check. Needs Bun runtime for full mutation testing setup (discovered during HG-007)
