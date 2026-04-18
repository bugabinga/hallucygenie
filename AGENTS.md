# AGENTS.md — HallucyGenie

You work on HallucyGenie. An AI chat app for a kid. Read this first.

## What It Is

Node.js proxy server + vanilla TS frontend. Talks to MiniMax APIs (chat, image, TTS, music). Mobile-first web UI. SQLite persistence. Podman deploy.

## Rules

- **No frameworks. No OOP. No enterprise patterns.** Plain functions. Plain objects.
- **No `bun test`.** Use `just test`. Justfile is law.
- **No `console.log`.** Use the logger: `import { createLogger } from "./log.ts"`
- **No hardcoded API keys.** `process.env.MINIMAX_API_KEY`. Fail fast if missing.
- **No classes.** Functions only. Return plain objects.
- **No overengineering.** Simple. Fast. Done.

## Stack

- **Runtime:** Node.js v25 (NOT Bun — doesn't work on Android/Termux)
- **Language:** TypeScript, run with `--experimental-strip-types`
- **Test runner:** Node built-in `--test`
- **DB:** `node:sqlite` (DatabaseSync)
- **Frontend:** Vanilla TS/CSS/HTML, no build step, served by Node
- **Container:** Podman quadlet, `oven/bun:1` base (ironic name, runs Node)

## Commands

```
just dev              # start server (port 3000)
just test             # run all unit tests (357 tests)
just test-coverage    # coverage report
just test-e2e         # Playwright E2E
just test-mutation    # stryker mutation testing
just install          # npm install
```

## Files

```
server.ts    — HTTP server, SSE proxy, request routing, session validation
agent.ts     — Agent loop, streaming, tool execution, steering, system prompt
tools.ts     — MiniMax tool wrappers (image, TTS, music)
db.ts        — SQLite migrations, CRUD, quota tracking
log.ts        — Structured logger (JSON prod / pretty dev + file)
public/app.ts — Frontend: SSE parsing, markdown, DOM rendering, streaming
public/style.css — Dark theme, red/green/gold, mobile-first
migrations/   — Numbered SQL files, auto-applied on startup
```

## Architecture

```
Browser → server.ts → agent.ts → MiniMax API
                  ↓        ↑
               db.ts    tools.ts
               log.ts
```

- Browser sends `POST /api/chat` with `X-Session-Id` header
- Server validates session, loads history from SQLite, runs agent loop
- Agent streams SSE back to browser (text, tool_start, tool_result, done)
- Tools call MiniMax APIs, return results as agent events
- Every request gets a `reqId` via `nextReqId()`, logged throughout

## MiniMax API

- **Base:** `https://api.minimax.io`
- **Chat:** `POST /v1/chat/completions`, model `MiniMax-M2.7-highspeed`
- **TTS:** `POST /v1/t2a_v2`, model `speech-2.8-hd`, returns hex MP3
- **Image:** `POST /v1/image_generation`, model `image-01`
- **Music:** `POST /v1/music_generation`, model `music-2.6`, returns hex MP3
- **Audio format:** hex-encoded MP3 → `Buffer.from(hex, "hex").toString("base64")` → data URL
- **Thinking tokens:** Model outputs `<think_intended>` (7 chars, NOT `<think_intended>`). Strip them.

## Session

- UUID in `X-Session-Id` header, client-owned, stored in localStorage
- Server partitions all data by session_id
- No server-side session creation

## SSE Events (server → browser)

```
event: text       → data: {"choices":[{"delta":{"content":"..."}}]}
event: tool_start → data: {"id":"...","name":"generate_image"}
event: tool_result→ data: {"id":"...","name":"...","result":{...}}
event: done       → data: {}
```

## Quotas (MiniMax Plus-Highspeed)

- Speech: 9,000 chars/day
- Images: 100/day
- Music: 100/day
- Enforced in `db.ts` → `checkQuota()`. Warn at 80%, block at 100%.

## Testing

- **100% line coverage** on agent.ts, tools.ts, db.ts
- **95%+ line coverage** on server.ts, app.ts
- **Mutation testing** via stryker on db.ts, tools.ts (≥80% score)
- **E2E** Playwright on Android/Termux (needs platform patches in playwright-core)
- Tests mock all external calls. No real API calls in tests.

## Logger

```ts
import { createLogger, nextReqId } from "./log.ts";
const log = createLogger({ service: "hallucygenie" });
const reqLog = log.child({ reqId: nextReqId(), sessionId });
reqLog.info("chat request", { messages: 3 });
```

- Dev: pretty to stderr + JSON to `logs/dev.log`
- Prod: JSON to stdout
- Non-blocking ring buffer, flushes every 500ms

## Don't

- Run `bun test` or `bun run` — Bun doesn't work on this machine
- Use classes, frameworks, OOP
- Hardcode API keys or log them
- Skip tests. `just test` must pass before commit.
- Modify `.gitignore` to track `.pi/` or `.pi-lens/` or `logs/` or `data/`
