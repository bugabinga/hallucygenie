---
{ "status": "fixed", "specs": ["HG-SPEC-008", "HG-SPEC-006", "HG-SPEC-011"] }
---

Repro: generate music with long lyrics through Create. Inspect resulting `generate_music` card input details. JSON value truncates lyrics instead of showing full structured input with minimal JSON syntax highlighting. Screenshot: `/tmp/pi-clipboard-f8c27f6b-29db-475f-8728-843ae0e4a7d5.png`.
Evidence: container DB `tool_input_history.input_json` for `f5b36420-13e0-467b-9eda-83df8c321290` is 1345 chars and contains full lyrics. UI details truncate because `public/app.ts` `sanitizeToolInput` slices strings above 500 chars. Container logs show matching `POST /api/create-tool` 200 and asset fetch 200, no truncation/error log.
Cause: previous fix added input details but reused defensive display sanitizer with hard 500-char string truncation. That hides valid user input in details.
Fix: input details no longer truncate safe strings. JSON details render with tiny key/string/number/literal/punctuation spans. Sanitizer still drops raw `data:`, base64/bytes, keys, tokens, secrets, and passwords. Tests cover long lyrics, filtering, and syntax spans.
