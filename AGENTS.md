# AGENTS.md — HallucyGenie

AI chat app for an 11-year-old gaming YouTuber. Read this first.

## What

Bun proxy + vanilla TS frontend. MiniMax APIs (chat, image, TTS, music). SQLite. Mobile-first dark UI. Podman deploy.

## Rules

- No frameworks. No OOP. No enterprise patterns. Plain functions. Plain objects.
- `just --list` shows all commands. `justfile` is law.
- `import { createLogger } from "./log.ts"` for logging inside `src/`. Never `console.log`.
- `process.env.MINIMAX_API_KEY` for API key. Never hardcode. Fail fast if missing.
- No classes. Functions only. Plain return objects.
- No overengineering. Simple. Fast. Done.
- When user reports an issue, always check `logs/dev.log` if present and capture relevant excerpts in `.system/issues/`.

## Constitution

Read `.system/CONSTITUTION.md` before changing code.

- Code and features must be simple. No "backwards compat" or "might need this in the future" code unless an accepted spec explicitly requires it.
- Errors must fail fast and hard — panic, crash, throw, or return a hard error immediately — unless the spec/feature explicitly demands graceful recovery.
- Keep complexity low: avoid deep OOP hierarchies, clever code, and abstractions with only one or two implementations.
- Prefer structural code: plain functions, plain objects, direct control flow, guard clauses, obvious data.
- When writing code, refer to the Tiger skill for style and conventions: `/home/me/.pi/agent/skills/tiger/SKILL.md`.
- Raw asset bytes belong only in asset storage. Never put raw image/audio/music data in agent context or chat history.

Strong prompt: read `.system/CONSTITUTION.md` before planning or reviewing non-trivial code.

## Stack

- **Runtime:** Bun 1.x
- **Language:** TypeScript (native TS support, no strip-types needed)
- **Test:** `bun test`, 300 unit tests, 100% line coverage on db/tools, 98%+ on agent/server
- **DB:** `bun:sqlite` (Database)
- **Frontend:** Vanilla TS/CSS/HTML, `esbuild` bundle
- **Container:** Podman quadlet

## Commands

```
just dev              # start dev server (port 3000)
just fmt              # format code (prettier)
just lint             # type check (tsc --noEmit)
just check            # fmt + lint pre-flight (CI pre-check)
just test-unit        # unit tests (all files)
just test-integration # integration tests (real HTTP + real DB)
just test-all         # check + test-unit + test-integration
just test-mutation    # stryker mutation tests (agent, tools, db)
just test-e2e         # Playwright E2E
just ci-act           # local GitHub Actions CI workflow via act
just ci-act-test      # local GitHub Actions test job via act
just ci-act-mutation  # local GitHub Actions mutation job via act
just ci-act-container # local GitHub Actions container job via act
just container-build  # build deploy container locally
just update-check     # check dependency updates
just install          # bun install
just roast "prompt"   # adversarial code critique
just brainstorm       # generate project ideas
just tiger            # enforce tiger coding style
just desloppy         # find and fix code ugliness
```

## Files

```
src/server.ts     — HTTP server, SSE proxy, routing, sessions
src/agent.ts      — agent loop, streaming, tools, steering, system prompt
src/tools.ts      — MiniMax wrappers (image, TTS, music, web_search, vision)
src/db.ts         — SQLite migrations, CRUD, quotas
src/log.ts        — structured logger (JSON prod / pretty dev + file)
public/app.ts     — frontend: SSE, markdown, DOM, streaming
public/style.css  — dark theme, red/green/gold
migrations/       — numbered SQL, auto-applied on startup
test/             — unit + integration tests
e2e/              — Playwright E2E specs
deploy/           — Podman/Docker files
```

## Architecture

```
Browser → src/server.ts → src/agent.ts → MiniMax API
                      ↓          ↑
                  src/db.ts   src/tools.ts
                  src/log.ts
```

- Browser: `POST /api/chat` + `X-Session-Id` header
- Server: validate session, load history, run agent loop
- Agent: stream SSE to browser (text, tool_start, tool_result, done)
- Tools: call MiniMax, return results as events
- Every request: `reqId` via `nextReqId()`, logged throughout

## MiniMax API

- **Base:** `https://api.minimax.io`
- **Chat:** `POST /anthropic/v1/messages`, `MiniMax-M2.7-highspeed` (Anthropic-compatible)
- **Auth:** `Authorization: Bearer <key>` header for all endpoints. The `/anthropic/v1/messages` endpoint accepts both `Authorization: Bearer` and `x-api-key`, but all other endpoints (TTS, image, music, web search, VLM) ONLY accept `Authorization: Bearer` and return `{"base_resp":{"status_code":1004}}` with `x-api-key`.
- **TTS:** `POST /v1/t2a_v2`, `speech-2.8-hd`, hex MP3 (NOTE: Plus-Highspeed plan only supports `speech-2.8-hd`. All other TTS models — `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo` — return `{"base_resp":{"status_code":2061,"status_msg":"your current token plan not support model"}}`.)
- **Image:** `POST /v1/image_generation`, `image-01`
- **Music:** `POST /v1/music_generation`, `music-2.6`, hex MP3. Instrumental uses `is_instrumental: true` and omits `lyrics`; non-instrumental uses `is_instrumental: false` with non-empty `lyrics`. Do not send stale `instrumental` field.
- **Web Search:** `POST /v1/coding_plan/search` (returns organic results)
- **Vision:** `POST /v1/coding_plan/vlm` (image understanding from URL)
- **Audio:** `Buffer.from(hex, "hex").toString("base64")` → data URL
- **Thinking:** Anthropic `thinking` content block, no tag parsing needed

## Session

- UUID in `X-Session-Id` header, client-owned, localStorage
- Server partitions all data by session_id
- No server-side session creation

## SSE (server → browser)

```
event: thinking   → {"content":"..."}
event: text       → {"content":"..."}
event: tool_start → {"id":"...","name":"generate_image"}
event: tool_result→ {"id":"...","name":"...","result":{...}}
event: done       → {}
```

## Quotas (Plus-Highspeed)

- Speech: 9,000 chars/day (model: `speech-hd` — only `speech-2.8-hd` works; other TTS models are unsupported)
- Images: 100/day (model: `image-01`)
- Music: 100/day (model: `music-2.6`)
- `src/db.ts` → `checkQuota()`. Warn 80%, block 100%.

### Important quota tracking note

Speech quota is tracked **per function call** (increments by 1 per TTS invocation), not per character. If a single TTS call uses 500 chars, you could make 18 calls before hitting the 9,000-char limit visually, but the counter only registers 18 — not 9,000. This is a design limitation: quota enforcement is call-count based, not character-count based.

### Plan model availability (tested 2026-04-19)

| Model              | Status                | Notes                           |
| ------------------ | --------------------- | ------------------------------- |
| `speech-2.8-hd`    | ✅ Works              | Latest HD TTS                   |
| `speech-2.8-turbo` | ❌ Unsupported        | Plan only has `speech-hd` quota |
| `speech-2.6-hd`    | ❌ Unsupported        |                                 |
| `speech-2.6-turbo` | ❌ Unsupported        |                                 |
| `speech-02-hd`     | ❌ Unsupported        |                                 |
| `speech-02-turbo`  | ❌ Unsupported        |                                 |
| `music-2.5`        | ❌ No quota allocated | Only `music-2.6` has quota      |

## Testing

- 300 unit tests
- 100% line coverage on `src/db.ts`, `src/tools.ts`
- 98%+ line coverage on `src/agent.ts`, `src/server.ts`
- Mutation testing ≥70%; CI uploads Stryker HTML reports as `mutation-reports` artifact.
- Integration tests: real HTTP server + SQLite
- E2E: Playwright (Android/Termux, patched playwright-core)
- All external calls mocked. No real API calls.
- `just check` must pass before commit. `just test-unit` must also pass.
- CI workflow can be checked locally with `just ci-act`, or per job with `just ci-act-test`, `just ci-act-mutation`, and `just ci-act-container`.
- Local act runs use `deploy/act/Dockerfile`; keep act runner fixes out of GitHub workflow YAML.

### Every Task Requires Tests

**This is not optional.** Every task must add appropriate tests before completion.

| Task Size | Required Tests                 |
| --------- | ------------------------------ |
| **S**     | Unit tests for new functions   |
| **M**     | Unit tests + integration tests |
| **L**     | Unit + integration + E2E tests |

**Decision framework:**

- New/modified functions → unit tests in `*.test.ts`
- New/modified API endpoints → integration tests in `test/integration.test.ts`
- New/modified UI features → E2E tests in `e2e/run-e2e.ts`
- Stable output formats → snapshot tests

## Logger

```ts
import { createLogger, nextReqId } from "./log.ts";
const log = createLogger({ service: "hallucygenie" });
const reqLog = log.child({ reqId: nextReqId(), sessionId });
reqLog.info("chat request", { messages: 3 });
```

- Dev: pretty stderr + JSON `logs/dev.log`
- Prod: JSON stdout
- Ring buffer, flushes 500ms, non-blocking

## Don't

- Use classes, frameworks, OOP
- Hardcode or log API keys
- Skip tests. `just test-unit` must pass before commit.
- Track `.pi/`, `.pi-lens/`, `logs/`, `data/` in git
