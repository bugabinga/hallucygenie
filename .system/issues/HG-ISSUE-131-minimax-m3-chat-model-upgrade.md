---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: 2026-06-11 MiniMax docs list `MiniMax-M3` for Anthropic/OpenAI chat. App still uses `MiniMax-M2.7-highspeed` in `src/agent.ts`. Existing specs allow internal model choice; no new product spec needed.
Cause: model choice is pinned before M3 release. M3 has 1M context, native image/video input, tool use, and default-disabled thinking. Upgrade changes context budget, thinking payload, stream events, tool-call contracts, quota/rate assumptions, and docs/static tests.
Fix: switched internal chat model to `MiniMax-M3`, kept `max_tokens:4096`, sent `thinking:{type:"adaptive"}`, and raised context budget to 995,904 input tokens. Mocked tests cover request payload, stream parsing, tool calls, fallback error copy, compact history replay, and raw asset byte guards. E2E MiniMax mock and Pi agent analyzer model metadata now use M3. Do not expose model picker to kids. Cross-ref HG-ISSUE-047, HG-ISSUE-075.
