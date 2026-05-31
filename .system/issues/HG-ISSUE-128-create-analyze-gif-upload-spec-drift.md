---
{ "status": "open", "specs": ["HG-SPEC-016", "HG-SPEC-011"] }
---

# HG-ISSUE-128: Create Analyze GIF upload spec drift

Repro:

- Open Create → Analyze.
- Choose or drop a local `.gif` image.

Observed:

- URL/data-path analyzer supports GIF via MiniMax `understand_image` docs.
- `src/tools.ts` accepts `image/gif` and `data:image/gif` for `analyze_image`.
- `src/agent.ts` user-safe error copy says JPG, PNG, GIF, or WebP.
- `public/index.html` Create Analyze local picker still accepts only `image/png,image/jpeg,image/webp`.
- `src/server.ts` `ANALYZE_IMAGE_MIMES` still omits `image/gif`.
- `test/unit/static.test.ts` still asserts PNG/JPEG/WebP only.
- `test/unit/server.test.ts` still rejects GIF upload.
- HG-SPEC-016 Analyze controls require local image picker/drop but do not list supported formats.

Cause:

- MiniMax GIF support was added to the direct `analyze_image` provider path, but local Create Analyze upload policy and HG-SPEC-016 format wording were not updated.

Fix:

- Human: update HG-SPEC-016 Analyze controls to name supported local formats: PNG, JPEG, GIF, WebP.
- Code: add `image/gif` to local Analyze upload acceptance and conversion.
- UI: update picker `accept` and dropzone copy to include GIF.
- Tests: update static/server/unit coverage so local GIF uploads remain asset-bound and raw bytes never enter chat/model context.
