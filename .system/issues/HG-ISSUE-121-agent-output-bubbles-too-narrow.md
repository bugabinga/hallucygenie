---
{ "status": "fixed", "specs": ["HG-SPEC-014", "HG-SPEC-002"] }
---

Repro: run agent web search or any rich/tool output on a wide viewport. Screenshot `/tmp/pi-clipboard-7343c9c6-1d73-4ba3-af21-6e9f6d635b7b.png` shows web-search output card using a narrow column while large right-side space is unused.
Cause: assistant/output bubble max width is tuned like plain readable prose and applied to rich/tool outputs too. Result cards, lists, media, and search output cannot use available chat row width.
Fix: split width rules: plain assistant prose keeps readable width, while assistant bubbles containing `.tool-card` use the wide row and the card fills it with mobile bounds. Added static/integration coverage for generic tool cards and Chrome E2E coverage for rich music output. Cross-ref HG-ISSUE-115, HG-ISSUE-116, HG-ISSUE-117, HG-ISSUE-119.
