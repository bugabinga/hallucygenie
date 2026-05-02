# HG-ISSUE-010 — Steering messages stay yellow, never processed after agent turn

**Status:** Fixed
**Severity:** High
**Reported:** 2026-05-01
**Components:** `src/agent.ts`, `src/server.ts`, `public/app.ts`
**Related:** `HG-ISSUE-002-steering-ui-layout-shift.md`, `HG-SPEC-005-local-draft-and-ui-state-persistence.md`

## Description

When a user sends a steering message during agent streaming, the yellow steer bubble appears in the UI. If the agent turn completes (end_turn → done event) before the steer is processed, the message stays yellow indefinitely. Nothing happens — no new agent turn, no context injection, no feedback.

The steer message is effectively orphaned: it sits in the in-memory `SteerQueue` with no active `runAgentLoop` to consume it.

## Steps to Reproduce

1. Send a chat message that triggers a long response
2. While streaming, type a steer message (yellow bubble appears)
3. Agent finishes its turn before steer is processed (e.g. model stops early, or steer arrives just after `drainSteer` check)
4. Yellow steer bubble stays — agent done, no new turn starts
5. Steer message is never injected into context

## Root Cause

**Race condition + no fallback processing.**

The `runAgentLoop` drains steer messages at two points:

- Line 619: after tool execution (tool_use turn boundary)
- Line 634: after end_turn (text turn boundary)

Both calls happen **synchronously inside the loop**. If the steer POST arrives after `drainSteer` runs but before the next iteration (or `done`), the message is queued but never consumed.

More critically: if the steer arrives **after** the `done` event, there is **no loop iteration left** to process it. The queue is in-memory only — never persisted to DB, never reprocessed on next chat request.

```
User types steer → POST /api/steer → queueSteer(q, msg)
Agent loop: drainSteer → empty (steer not yet arrived)
Agent loop: → done event
Steer message now orphaned in queue, no consumer
```

Additionally, the frontend renders the steer as a permanent yellow `message--steer` element. After `done`, the UI never clears or converts it.

## Possible Fixes

### A. Convert orphaned steers to user messages on done

In `server.ts`, after `runAgentLoop` returns, check the steer queue. If messages remain, save them as normal user messages to DB. On next chat request, they'll be in history.

### B. Re-enter agent loop if steer queued after done

After `done` event, wait briefly (100ms). If steer queue has messages, inject them and restart the loop. This is complex and fragile.

### C. Frontend: block steering during last streaming chunk

Disable steer input once the `done` SSE event fires. Prevents orphaned messages. But user loses ability to steer at the very end.

### D. Drain queue into next chat request

Store undrained steer messages in DB. On the next `POST /api/chat`, prepend them to the message history before calling `runAgentLoop`. This is the cleanest fix — steers become "pending" messages that get picked up next turn.

**Recommendation:** Option A + frontend cleanup. After `done`, save orphaned steers as user messages and re-render them as normal (blue) user messages instead of yellow. Simple, no loop restart needed.

## Affected Code

- `src/agent.ts:618-626` — drainSteer at tool turn boundary
- `src/agent.ts:633-648` — drainSteer at text turn boundary
- `src/server.ts:525-542` — POST /api/steer handler, queueSteer
- `src/server.ts:281-282` — steerQueue creation per chat request
- `src/server.ts:346` — steerQueue passed to runAgentLoop
- `src/server.ts:349-368` — post-loop message saving (doesn't check for orphaned steers)
- `public/app.ts:664-686` — sendSteerMessage, renders yellow bubble
- `public/app.ts:187-197` — renderSteerMessage (yellow styling)

## Tests Needed

- Unit: drainSteer returns queued messages, queue is empty after
- Unit: steer queued after loop ends → orphan detected
- Integration: POST /api/steer → POST /api/chat → orphaned steer in next context
- E2E: steer during streaming → verify agent responds to steer

## 2026-05-02 fix

### Reproduce

During streaming, a steer message renders as `.message--steer`. If the agent turn finishes before the server loop consumes the queued steer, the yellow bubble can remain forever and the queue has no active consumer.

### Hypothesis

Two cleanup paths were missing:

1. Server should drain any remaining queued steers after `runAgentLoop()` returns and persist them as user messages for the next turn.
2. Frontend should not leave steer bubbles visually yellow after streaming ends.

### Fix applied

- `src/server.ts`
  - imports `drainSteer`
  - after saving final agent messages, drains leftover steer queue and saves each leftover as a normal `user` message
- `public/app.ts`
  - `finishStreaming()` removes `.message--steer` from any steer bubbles so they become normal user bubbles visually

### Verification

- `bun test test/app.test.ts --timeout 30000` → 144 pass
- Manual Chrome mock stream:
  - submit normal message
  - submit steer while streaming
  - stream finishes
  - observed `/api/steer` POST body: `late steer`
  - `.message--steer` count after done: `0`
  - user bubble count: `2`

### Prevention

Added frontend regression test:

- `[DONE] signal converts steer bubbles to normal user bubbles`
