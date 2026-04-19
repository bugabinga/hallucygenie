# General — Context

**Last Updated:** 2026-04-19
**Status:** Feature complete
**Next Task ID:** HG-028

---

## Current State

HallucyGenie is a kid-friendly AI chat app for an 11-year-old gaming YouTuber.
It proxies MiniMax APIs (chat, TTS, image gen, music gen, web search, vision analysis)
through a Node.js backend with a mobile-first web frontend.

**Tech stack:** Node.js v25 (TypeScript), vanilla HTML/CSS/TS frontend, SQLite,
Podman quadlet deployment.

**No frameworks. No OOP. No overengineering.** Plain functions, plain objects.

---

## Key Files

| Category   | Path                            |
| ---------- | ------------------------------- |
| Tasks      | `Tasks/`                        |
| Server     | `server.ts`                     |
| Agent loop | `agent.ts`                      |
| Tools      | `tools.ts`                      |
| Database   | `db.ts`                         |
| Frontend   | `public/`                       |
| Migrations | `migrations/`                   |
| Tests      | `*.test.ts`, `public/*.test.ts` |

---

## Test Coverage (as of 2026-04-19)

| File          | Line %                    | Branch %    | Func %      |
| ------------- | ------------------------- | ----------- | ----------- |
| agent.ts      | 100%                      | ~94%        | 100%        |
| db.ts         | 100%                      | ~97%        | 100%        |
| tools.ts      | 100%                      | 100%        | 100%        |
| server.ts     | ~96%                      | ~92%        | ~96%        |
| public/app.ts | ~37% → 55%+ (post HG-024) | ~78% → 80%+ | ~25% → 40%+ |

**Total unit tests:** 223 → 168+ (post HG-024)

---

## Completed Tasks

| ID     | Task                         | Batch  |
| ------ | ---------------------------- | ------ |
| HG-002 | Project scaffold             | —      |
| HG-003 | Server chat proxy            | —      |
| HG-004 | Agent loop + tools           | —      |
| HG-005 | Persistence + quotas         | —      |
| HG-006 | Integration wiring           | —      |
| HG-007 | Frontend MVP                 | —      |
| HG-008 | Server coverage gaps         | —      |
| HG-009 | Frontend coverage gaps       | —      |
| HG-010 | Anthropic endpoint migration | 3      |
| HG-011 | Prompt caching               | 4      |
| HG-012 | Token-based context window   | 4      |
| HG-013 | Quota API + usage badge      | manual |
| HG-017 | First-run onboarding         | manual |
| HG-018 | Media tools + forms UI       | manual |
| HG-019 | Asset persistence + gallery  | manual |
| HG-020 | Test suite overhaul          | manual |

---

## Technical Debt / Future Work

- [ ] **Playwright E2E testing** — requires monkey-patching playwright-core registry for Android
- [ ] **Stryker mutation testing** — OOM on this device for agent.ts/server.ts

## Planned Refactors (breaking)

| ID     | Task                                 | Risk    | Breaking               |
| ------ | ------------------------------------ | ------- | ---------------------- | ------------------------- |
| HG-021 | Markdown renderer rewrite (→ marked) | low     | output format          | adversarial: KEEP 4       |
| HG-022 | handleNodeRequest simplification     | minimal | none                   | adversarial: KEEP 5       |
| HG-023 | Module-level globals refactor        | medium  | none (closure factory) | adversarial: KILL→REWRITE |
| HG-024 | Test enhancement — SSE streaming     | low     | none                   | depends on HG-023         |

## Planned Features

| ID     | Feature                                              | Priority |
| ------ | ---------------------------------------------------- | -------- |
| HG-025 | Image History Browser — already implemented (HG-019) |
| HG-026 | Chat Personality Selector                            |
| HG-027 | E2E Test Overhaul                                    | —        |
| HG-028 | Gaming Co-Creator Button                             | deferred |

- ~~Image History Browser~~ → HG-025
- Chat Personality Selector (ideas.md RECOMMENDATION 2)
- Gaming Co-Creator Button (ideas.md RECOMMENDATION 3, deferred)
- Chat Personality Selector (ideas.md RECOMMENDATION 2)
- Gaming Co-Creator Button (ideas.md RECOMMENDATION 3, deferred)

---

## Key Architecture Decisions

- **Anthropic endpoint** (`/anthropic/v1/messages`) is primary — has prompt caching
- **204,800 token context window** (chars/4 heuristic for estimation)
- **File storage** for media (not SQLite blobs) — `data/assets/{sessionId}/`
- **MiniMax auth:** `Authorization: Bearer <key>` header (NOT `x-api-key`)
- **Browser SSE:** custom protocol — `event: text|thinking|tool_start|tool_result|done`
- **UI approach:** agents failed 20+ iterations on UI tasks — manual implementation required
