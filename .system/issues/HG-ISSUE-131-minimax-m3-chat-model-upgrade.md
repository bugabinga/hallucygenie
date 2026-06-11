---
{ "status": "open", "specs": ["HG-SPEC-011"] }
---

Repro: 2026-06-11 MiniMax docs list `MiniMax-M3` for Anthropic/OpenAI chat. App still uses `MiniMax-M2.7-highspeed` in `src/agent.ts`. Existing specs allow internal model choice; no new product spec needed.
Cause: model choice is pinned before M3 release. M3 has 1M context, native image/video input, tool use, and default-disabled thinking. Upgrade changes context budget, thinking payload, stream events, tool-call contracts, quota/rate assumptions, and docs/static tests.
Fix: update existing docs/spec contracts where needed, then switch internal chat model to M3. Mocked tests must cover request payload, stream parsing, thinking disabled/adaptive decision, tool calls, fallback error copy, compact history replay, and no raw asset bytes in model context. Do not expose model picker to kids. Cross-ref HG-ISSUE-047, HG-ISSUE-075.
