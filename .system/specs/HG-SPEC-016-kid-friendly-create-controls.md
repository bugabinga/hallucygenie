# HG-SPEC-016: Kid-friendly Create controls

## Problem

Create exposes raw API-shaped controls. Kids should not understand MiniMax params, numeric bounds, IDs, or optimizer semantics to make things.

## Design decisions

- Create UI uses kid-friendly controls for bounded values:
  - finite choices → select/combobox
  - small choice sets → radio/segmented buttons
  - bounded numeric ranges → sliders with labels/ticks
  - free-form text only for creative prompts, lyrics, search queries, and URL fallback
- Labels describe outcome, not API names.
- Helper text explains cause/effect in one short sentence.
- Technical controls are hidden unless clearly useful and explained.
- Tool schema, explicit directive allowlist, Create UI, and tests stay aligned.

## Image controls

- Count uses fixed choices from MiniMax-supported `n`.
- Aspect ratio remains fixed choices.
- Size uses presets or sliders with common snap ticks.
- Width/Height stay linked to selected aspect ratio.
- Seed is hidden by default or presented as “surprise code”:
  - optional
  - random button
  - simple explanation: “Same code can make a similar picture again.”
- Prompt optimizer label explains behavior:
  - “Let Genie improve my idea before drawing”
  - helper: “Adds clearer details so MiniMax understands your idea better.”

## Voice controls

- Voice uses a supported-voice selector, not free text.
- Voice names are readable.
- Sort order favors likely German child usefulness:
  1. English
  2. German
  3. Europe
  4. Rest
- Volume uses slider with low/normal/loud labels.
- Pitch uses slider with deep/normal/high labels.

## Analyze controls

- Local image picker and drag/drop required.
- URL remains fallback.
- Raw image bytes never enter chat history or agent context.

## Invariants

- UI must not broaden MiniMax parameter surface without tests.
- Static tests assert bounded params are not raw text/number boxes unless spec explicitly permits.
