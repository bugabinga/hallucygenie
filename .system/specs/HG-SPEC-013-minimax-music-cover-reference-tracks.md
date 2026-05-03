# HG-SPEC-013: MiniMax music cover from reference tracks

## Problem

MiniMax has `music-cover` quota (100). Exciting use case: paste YouTube URL → cover → new creator-safe music. But risky: YouTube ToS, copyright, artist imitation, deploy deps.

## Design decisions

- Research first. No implementation until research + policy decided.
- Rights gate UI: user must attest (own video / royalty-free / permission). No attestation = no extraction.
- Prompt transformation encourages "spooky boss battle" not "copy exactly".
- Temp extraction files under `data/tmp/cover/`, cleaned on success/failure.
- Source metadata saved. Raw source audio never in chat history.
- Safest v1 options: bundled samples, user-provided legal audio URL, or own-channel only.
