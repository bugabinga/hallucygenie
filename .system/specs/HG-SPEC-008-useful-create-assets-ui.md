# HG-SPEC-008: Useful Create→Assets UI

## Problem

Assets tab is a debug list. No useful previews, params, or download. Kid can't remember what each asset was.

## Design decisions

- Cards show: media type badge, preview (image thumbnail or `<audio controls>`), prompt, tool/model/date, params, download button.
- Audio uses visible native `<audio controls preload="metadata">`. No hidden `new Audio().play()`.
- Download: `<a href="/asset/{id}" download>`.
- `assets` table gets `params_json` column with generation params (model, aspect_ratio, lyrics, speed, etc).
- Mobile-friendly compact cards. Long prompts collapsible.
