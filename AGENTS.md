# AGENTS.md — HallucyGenie

AI chat app for an 11-year-old gaming YouTuber. Read this first.

## What

Node.js proxy + vanilla TS frontend. MiniMax APIs (chat, image, TTS, music). SQLite. Mobile-first dark UI. Podman deploy.

## Rules

- No frameworks. No OOP. No enterprise patterns. Plain functions. Plain objects.
- `just test` to test. Justfile is law. Never `bun test`.
- `import { createLogger } from "./log.ts"` for logging. Never `console.log`.
- `process.env.MINIMAX_API_KEY` for API key. Never hardcode. Fail fast if missing.
- No classes. Functions only. Plain return objects.
- No overengineering. Simple. Fast. Done.

## Stack

- **Runtime:** Node.js v25 (Bun broken on Android/Termux)
- **Language:** TypeScript, `--experimental-strip-types`
- **Test:** Node `--test`, 357 tests, 97%+ coverage
- **DB:** `node:sqlite` (DatabaseSync)
- **Frontend:** Vanilla TS/CSS/HTML, no build step
- **Container:** Podman quadlet

## Commands

```
just dev              # start server (port 3000)
just test             # run all unit tests
just test-coverage    # coverage report
just test-e2e         # Playwright E2E
just install          # npm install
```

## Files

```
server.ts    — HTTP server, SSE proxy, routing, sessions
agent.ts     — agent loop, streaming, tools, steering, system prompt
tools.ts     — MiniMax wrappers (image, TTS, music)
db.ts        — SQLite migrations, CRUD, quotas
log.ts       — structured logger (JSON prod / pretty dev + file)
public/app.ts — frontend: SSE, markdown, DOM, streaming
public/style.css — dark theme, red/green/gold
migrations/   — numbered SQL, auto-applied on startup
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
- **Chat:** `POST /v1/chat/completions`, `MiniMax-M2.7-highspeed`
- **TTS:** `POST /v1/t2a_v2`, `speech-2.8-hd`, hex MP3
- **Image:** `POST /v1/image_generation`, `image-01`
- **Music:** `POST /v1/music_generation`, `music-2.6`, hex MP3
- **Audio:** `Buffer.from(hex, "hex").toString("base64")` → data URL
- **Thinking:** model outputs `<think_intended>` (7 chars). Strip it.

## Session

- UUID in `X-Session-Id` header, client-owned, localStorage
- Server partitions all data by session_id
- No server-side session creation

## SSE (server → browser)

```
event: text       → {"choices":[{"delta":{"content":"..."}}]}
event: tool_start → {"id":"...","name":"generate_image"}
event: tool_result→ {"id":"...","name":"...","result":{...}}
event: done       → {}
```

## Quotas (Plus-Highspeed)

- Speech: 9,000 chars/day
- Images: 100/day
- Music: 100/day
- `db.ts` → `checkQuota()`. Warn 80%, block 100%.

## Testing

- 100% coverage on agent.ts, tools.ts, db.ts
- 95%+ on server.ts, app.ts
- Mutation testing ≥80% on db.ts, tools.ts
- E2E Playwright (Android/Termux, patched playwright-core)
- All external calls mocked. No real API calls.

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
- Skip tests. `just test` must pass before commit.
- Track `.pi/`, `.pi-lens/`, `logs/`, `data/` in git
