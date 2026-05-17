---
{ "status": "open", "specs": ["HG-SPEC-004", "HG-SPEC-011", "HG-SPEC-015"] }
---

# HG-ISSUE-077: Create Analyze needs file picker and drag/drop image input

Repro:

- Open Create → Analyze.
- Try to analyze an image stored locally on the device.
- Try to drag an image file into the Analyze panel.

Observed:

- Analyze only accepts an image URL.
- There is no file picker for local images.
- Dragging and dropping an image file is not supported.

Expected:

- Create → Analyze should support local image files via:
  - file picker button/input
  - drag-and-drop drop zone
- Supported formats should match analyzer constraints: PNG, JPEG, WebP, and app-accepted safe image types if implemented.
- UI should show selected file name/preview/status before submission.
- Drag/drop should be keyboard/a11y friendly and not break URL-based analyze flow.
- Raw image bytes must not enter chat history or agent context.

Constraints:

- Preserve HG-SPEC-011 raw asset invariant: raw media data stays out of messages/model context.
- Prefer asset-bound flow: upload/store local file as an asset, then analyze via server-owned asset or provider-bound data conversion.
- Reject oversized/unsupported files with friendly UI errors.
- Add tests for file input, drag/drop, unsupported file rejection, and no raw `data:` image leakage into messages/history.

Possible fix:

- Add Analyze panel drop zone and hidden `<input type="file" accept="image/png,image/jpeg,image/webp">`.
- Add server endpoint or reuse asset upload path for analyze input.
- Convert stored asset to provider payload server-side; send only asset refs through UI/chat where possible.
- Keep URL analyze as existing option.
