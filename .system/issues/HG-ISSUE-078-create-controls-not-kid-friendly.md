---
{
    "status": "fixed",
    "specs": [
        "HG-SPEC-004",
        "HG-SPEC-006",
        "HG-SPEC-008",
        "HG-SPEC-011",
        "HG-SPEC-012",
        "HG-SPEC-015",
        "HG-SPEC-016"
    ]
}
---

# HG-ISSUE-078: Create controls are too technical for kids

Repro:

- Open Create → Image.
- Inspect Count, Seed, Width, Height, Optimize prompt.
- Open Create → Voice.
- Inspect Voice, Volume, Pitch.
- Open Create → Analyze.
- Inspect image input.

Observed:

- Create exposes too many free-form number/text controls.
- Image Count is a numeric text box instead of fixed allowed choices.
- Image Seed is technical and unexplained.
- Image Width and Height are independent numeric boxes; changing one does not preserve selected aspect ratio.
- Image Optimize prompt is mysterious; label does not explain what changes.
- Voice ID is a free-form technical string; supported voices are not discoverable.
- Voice Volume and Pitch are numeric boxes instead of playful bounded sliders.
- Analyze local file picker and drag/drop are missing; tracked separately by HG-ISSUE-077.

Expected:

- Create controls prefer fixed-value inputs where API range is bounded:
  - combobox/select for finite choices
  - slider for bounded numeric ranges
  - radio/segmented choice for small sets
  - free-form text only for prompts, lyrics, search, and image URL fallback
- Image Count should be a combobox/select based on MiniMax `n` limit.
- Image Seed should either be removed or replaced with:
  - friendly optional “surprise code” explanation
  - “random seed” button
  - safe default that kids can ignore
- Image Width/Height should become size presets or sliders with snap ticks at common safe sizes.
- Width/Height changes should preserve selected aspect ratio; changing one updates the other.
- Optimize prompt should get kid-friendly copy, e.g. “Let Genie make my idea clearer before drawing”.
- Voice should be a combobox/select populated from supported MiniMax voices.
- Voice labels should be readable and sorted by likely usefulness for a German child:
  1. English
  2. German
  3. Europe
  4. Rest
- Voice Volume and Pitch should be sliders with clear low/normal/high labels.
- Analyze file picker/drop zone remains HG-ISSUE-077 scope.

Cause:

- HG-ISSUE-066 exposed MiniMax params for coverage, but Create UI did not translate bounded API params into kid-friendly controls.
- HG-SPEC-016 now requires fixed-value controls for bounded Create inputs.

Fix:

- Replaced Image Count number box with fixed choices.
- Replaced Width/Height number boxes with a Picture size preset selector and hidden linked dimensions.
- Added aspect-ratio-preserving size calculation.
- Replaced Seed number box with hidden optional “surprise code” and random-roll button.
- Rewrote prompt optimizer copy to explain the outcome.
- Replaced Voice ID free text with sorted supported system voice choices: English, Deutsch, Europe, Rest.
- Replaced Voice Volume/Pitch number boxes with sliders and plain labels.
- Kept tool schema and directive allowlist unchanged.
- Added static tests for kid-friendly bounded controls and voice ordering.
- Added app tests for linked size presets and surprise-code generation.

Constraints:

- Do not broaden MiniMax parameter surface.
- Preserve existing raw asset invariant.
- Do not solve HG-ISSUE-077 here except by referencing it.
