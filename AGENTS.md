# AGENTS.md — HallucyGenie

AI chat app for an 11-year-old gaming YouTuber. Read this first.

## What

Node.js proxy + vanilla TS frontend. MiniMax APIs (chat, image, TTS, music). SQLite. Mobile-first dark UI. Podman deploy.

## Rules

- No frameworks. No OOP. No enterprise patterns. Plain functions. Plain objects.
- `just --list` shows all commands. `justfile` is law. Never `bun test`.
- `import { createLogger } from "./log.ts"` for logging. Never `console.log`.
- `process.env.MINIMAX_API_KEY` for API key. Never hardcode. Fail fast if missing.
- No classes. Functions only. Plain return objects.
- No overengineering. Simple. Fast. Done.

## Stack

- **Runtime:** Node.js v25 (Bun broken on Android/Termux)
- **Language:** TypeScript, `--experimental-strip-types`
- **Test:** Node `--test`, 372+ unit tests, 100% line coverage on db/tools, 98%+ on agent/server
- **DB:** `node:sqlite` (DatabaseSync)
- **Frontend:** Vanilla TS/CSS/HTML, `esbuild` bundle
- **Container:** Podman quadlet

## Commands

```
just dev              # start dev server (port 3000)
just fmt              # format code (prettier)
just lint             # type check (tsc --noEmit)
just check            # fmt + lint pre-flight (CI pre-check)
just test-unit        # unit tests (~26s wall clock, all files)
just test-integration # integration tests (real HTTP + real DB)
just test-all         # check + test-unit + test-integration
just test-mutation    # stryker mutation tests (agent, tools, db)
just test-e2e         # Playwright E2E
just install          # npm install
```

## Files

```
server.ts     — HTTP server, SSE proxy, routing, sessions
agent.ts      — agent loop, streaming, tools, steering, system prompt
tools.ts      — MiniMax wrappers (image, TTS, music, web_search, vision)
db.ts         — SQLite migrations, CRUD, quotas
log.ts        — structured logger (JSON prod / pretty dev + file)
public/app.ts — frontend: SSE, markdown, DOM, streaming
public/style.css — dark theme, red/green/gold
migrations/   — numbered SQL, auto-applied on startup
integration.test.ts — integration tests (real HTTP server)
e2e/           — Playwright E2E specs
```

## Architecture

```
Browser → server.ts → agent.ts → MiniMax API
                  ↓        ↑
               db.ts    tools.ts
               log.ts
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
- **Music:** `POST /v1/music_generation`, `music-2.6`, hex MP3
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
- `db.ts` → `checkQuota()`. Warn 80%, block 100%.

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

- 372 unit tests, <30s wall clock
- 100% line coverage on db.ts, tools.ts
- 98%+ line coverage on agent.ts, server.ts
- Mutation testing ≥70% on tools.ts
- Integration tests: real HTTP server + SQLite
- E2E: Playwright (Android/Termux, patched playwright-core)
- All external calls mocked. No real API calls.
- `just check` must pass before commit. `just test-unit` must also pass.

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

- Run `bun test` or `bun run` — broken on this machine
- Use classes, frameworks, OOP
- Hardcode or log API keys
- Skip tests. `just test-unit` must pass before commit.
- Track `.pi/`, `.pi-lens/`, `logs/`, `data/` in git
