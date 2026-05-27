---
{ "status": "open", "specs": ["HG-SPEC-012", "HG-SPEC-008", "HG-SPEC-014"] }
---

Repro: generate music in chat and inspect the music tool widget. Screenshot `/tmp/pi-clipboard-b06fb9ff-d579-49da-ae53-3358d621088f.png` shows the widget left-aligned, ~one-third row width, with large unused space to the right; audio controls fit but feel cramped.
Cause: music tool card/audio result uses narrow content sizing instead of available assistant/tool-card width.
Fix: widen music/audio tool cards to use the message column width with sane max/min widths, keep mobile fit, and add visual/layout regression. Cross-ref HG-ISSUE-007, HG-ISSUE-012, HG-ISSUE-039, HG-ISSUE-074.
