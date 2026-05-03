---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-018: Context window exceeds limit after tool results

MiniMax returned `invalid params, context window exceeds limit (2013)` after music/TTS.
Root cause: `runAgentLoop()` put raw `data:audio/mp3;base64,...` into next model context.
Sliding context window applied only once before loop, not after tool results.
Fix: strip raw media from context inside loop. Reapply context window after each tool turn.
