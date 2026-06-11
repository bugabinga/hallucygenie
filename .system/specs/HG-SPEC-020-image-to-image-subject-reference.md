# HG-SPEC-020: Image-to-image subject reference

## Problem

MiniMax supports image-to-image subject references.
HallucyGenie only supports text-to-image.

Kids need “make a picture using this character/photo” without raw API controls.

## Design decisions

- Extend Create Image with optional reference image.
- Reference image comes from local upload or existing asset.
- UI label describes outcome, not API terms.
- HallucyGenie chooses subject-reference payload internally.
- No base64 field.
- No raw URL field for first version.
- No `image-01-live` selector.
- Raw reference bytes stay in asset storage or transient provider upload path only.
- Agent/chat history gets compact reference summary only.
- Generated output follows existing image asset flow.

## Behavioral contracts

- Upload stores reference as asset or validates transient upload before provider call.
- Generate call sends provider-compatible subject reference.
- Result images save as normal image assets.
- History item records prompt and reference asset id.
- Tweak/reuse restores prompt and reference selection.
- Invalid image type fails before provider call.
- No raw image bytes, base64, or data URLs enter messages, prompts, logs, or tool history.
- Tests cover local reference image, existing asset reference, invalid files, payload shape, and asset persistence.
