---
{ "status": "open", "specs": ["HG-SPEC-011", "HG-SPEC-012", "HG-SPEC-016"] }
---

# HG-ISSUE-080: Create string protocol corrupts params

Repro:

- Open Create → Music.
- Enter prompt.
- Enter lyrics with commas and multiple lines.
- Submit.
- Inspect parsed `generate_music` args.

Observed:

- `parseToolParams()` splits params on newline and comma.
- Lyrics after first comma/newline are ignored or parsed as garbage.
- Same risk exists for Analyze prompt and any creative text params.

Expected:

- Creative text survives exactly except documented trimming/caps.
- Bounded params stay bounded.

Cause:

- UI serializes structured params into text:
  `Tool params: lyrics=${lyrics}`.
- Server recovers structure with regex and delimiter splitting.

Fix:

- Stop using chat text as transport for Create params.
- Send JSON payload with typed fields.
- Keep parser only for manual chat directives if needed.
- Add regression for comma + multiline lyrics and Analyze prompt.
