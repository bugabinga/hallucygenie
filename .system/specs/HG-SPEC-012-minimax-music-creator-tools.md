# HG-SPEC-012: MiniMax music creator tools

## Problem

MiniMax has `lyrics_generation` quota (100). Music creation flow needs kid-friendly lyrics + song generation. Raw API tools are not kid-friendly.

## Design decisions

- Separate LLM tools (`generate_lyrics`, `generate_music`), integrated Create UI.
- Empty lyrics → `is_instrumental: true`. Non-empty → `is_instrumental: false`.
- "Write lyrics for me" button in Create→Music: calls `generate_lyrics`, fills editable field, kid decides before spending music quota.
- Agent can sequence: `generate_lyrics` → `generate_music` in one turn when asked.
- Cover/remix is HG-SPEC-013, not this spec.
- No raw audio in agent context or chat history. Compact tool messages only.
