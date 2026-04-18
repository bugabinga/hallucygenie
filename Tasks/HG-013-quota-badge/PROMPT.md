# Task: HG-013 — Quota API + Usage Badge

**Created:** 2026-04-18
**Size:** S

## Review Level: 1 (Plan Only)

**Assessment:** New read-only endpoint + small UI element. No security impact (read-only, API key not exposed).
**Score:** 2/8 — Blast radius: 1 (server + frontend), Pattern novelty: 1 (new API integration), Security: 0, Reversibility: 0

## Mission

Add a `/api/quota` endpoint that fetches current usage from MiniMax's quota API (`GET /v1/token_plan/remains`). Show a small usage badge in the frontend header so the kid (and parent) can see remaining limits.

**Why:** Prevents surprise "you're out of images!" moments. Kid-friendly visibility into usage.

## Dependencies

- **None** (uses existing OpenAI-compatible `Authorization: Bearer` auth for quota endpoint, NOT the Anthropic auth)

## Context to Read First

- `server.ts` — existing route handling
- `public/app.ts` — existing header rendering
- `public/style.css` — existing dark theme

## Key Reference

**Quota endpoint:** `GET https://api.minimax.io/v1/token_plan/remains`
**Auth:** `Authorization: Bearer <MINIMAX_API_KEY>` (NOT `x-api-key` — quota endpoint uses Bearer auth)

**Response:**
```json
{
  "model_remains": [
    {
      "model_name": "MiniMax-M*",
      "current_interval_total_count": 4500,
      "current_interval_usage_count": 62,
      "remains_time": 2463111,
      "current_interval_total_count": 4500
    },
    {"model_name": "speech-hd", ...},
    {"model_name": "image-01", ...},
    {"model_name": "music-2.6", ...}
  ]
}
```

## File Scope

- `server.ts` — add `GET /api/quota` route handler
- `server.test.ts` — test quota endpoint
- `public/app.ts` — add usage badge in header, poll quota
- `public/style.css` — badge styles
- `public/app.test.ts` — test badge rendering

## Steps

### Step 1: Add quota API endpoint

- [ ] Add `GET /api/quota` route in `handleRequest()`
- [ ] Call MiniMax `GET /v1/token_plan/remains` with `Authorization: Bearer` header
- [ ] Simplify response: extract key models (MiniMax-M*, speech-hd, image-01, music-2.6), return `{chat: {used, total, resetsInMs}, speech: {...}, image: {...}, music: {...}}`
- [ ] Handle API errors gracefully (return zeros, log warning)

### Step 2: Frontend usage badge

- [ ] Add small badge element in header (next to title)
- [ ] On page load + every 60s, `GET /api/quota`
- [ ] Show compact format: "💬 4,438 | 🎨 95 | 🎵 98 | 🎤 9,000"
- [ ] Yellow at 80% used, red at 95% used
- [ ] Clicking badge shows detail modal with full breakdown and reset timers
- [ ] Keep it tiny and non-distracting — this is for the parent monitoring

### Step 3: Test

- [ ] Test `/api/quota` endpoint with mocked MiniMax response
- [ ] Test error handling (MiniMax API down, key invalid)
- [ ] Test frontend badge rendering
- [ ] `just test` passes all tests

## Do NOT

- Expose the API key to the frontend
- Block chat when quota is low — just show warning
- Modify `agent.ts`, `tools.ts`, or `db.ts`
- Overbuild the UI — keep badge minimal

## Must Update

- `Tasks/CONTEXT.md` — update test coverage

## Check If Affected

- `agent.ts` — should NOT change
- `tools.ts` — should NOT change
- `db.ts` — should NOT change

## Git Commit Convention

```
HG-013: add quota API endpoint and usage badge

- GET /api/quota proxies MiniMax token_plan/remains
- Header badge shows remaining limits
- Polls every 60s, color-coded warnings
- Co-authored-by: task-agent
```

## Amendments
