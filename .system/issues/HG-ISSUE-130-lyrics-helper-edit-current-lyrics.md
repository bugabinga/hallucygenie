---
{ "status": "fixed", "specs": ["HG-SPEC-012", "HG-SPEC-016", "HG-SPEC-005", "HG-SPEC-006"] }
---

Repro: Create → Music → enter lyrics draft → click `Write lyrics for me ✨`. UI sends only `{ "prompt": musicPrompt }` to `generate_lyrics`; current lyrics textarea is ignored and then overwritten by generated output. Container DB shows recent `generate_lyrics` input only `{"prompt":"dub and step beatbox metal"}`, followed by `generate_music` using returned lyrics.
Cause: frontend button is wired as new-lyrics generation only. Tool/server already support MiniMax lyrics `edit` mode with existing `lyrics`, and provider docs say `mode:"edit"` edits/continues existing lyrics. Create UI does not expose that mode or pass current lyrics.
Fix: lyrics helper is adaptive. Empty textarea keeps `Write lyrics for me ✨` and sends `{ prompt }`. Non-empty textarea shows `Improve my lyrics ✨` and sends `{ prompt, mode:"edit", lyrics }`. Result persists back into textarea/draft. Unit test asserts exact Create payload and result fill. Cross-ref HG-ISSUE-066, HG-ISSUE-081, HG-ISSUE-080, HG-ISSUE-078, HG-ISSUE-051.
