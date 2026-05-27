---
{ "status": "open", "specs": ["HG-SPEC-016", "HG-SPEC-006", "HG-SPEC-008"] }
---

Repro: open Create → Voice. Try to add MiniMax TTS pause markers or interjections without memorizing syntax. UI has no mouse-based pause/interjection builder; kid must type `<#x#>` and tags manually.
Cause: TTS model supports pause markers and interjection tags, but HallucyGenie exposes voice text as plain text plus basic voice/speed/volume/pitch controls. No UI validates marker placement, duration range, model support, or supported interjection vocabulary.
Fix: add kid-friendly TTS composer controls: insert pause between text segments with duration picker `[0.01,99.99]`, prevent consecutive/edge pause markers, add interjection palette for supported tags, gate interjections to `speech-2.8-hd`/`speech-2.8-turbo`, store sanitized text/params in history/assets, and cover edit/details flows. Cross-ref HG-ISSUE-054, HG-ISSUE-066, HG-ISSUE-078, HG-ISSUE-116, HG-ISSUE-119.
