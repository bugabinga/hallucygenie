---
{ "status": "fixed", "specs": ["HG-SPEC-011", "HG-SPEC-012"] }
---

Full Chrome E2E exposed stale MiniMax mock response shapes for TTS/music.

Cause: mock used old `hex`/array payloads while tool code expects `data.audio`.

Fix: E2E mock now returns current `data.audio` hex for TTS/music and covers lyrics generation.
