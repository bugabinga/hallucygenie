---
{ "status": "fixed", "specs": ["HG-SPEC-008"] }
---

Repro: read manual Firefox screenshots `05-image-result.png`, `06-lightbox.png`, `07-assets-tab.png`.
Generated image result/lightbox/assets card show blank/alt text, not visible image preview.
Cause: E2E MiniMax image mock returned only an 8-byte PNG signature, not a decodable PNG.
Fix: mock returns valid tiny PNG; E2E asserts generated image loads in chat card, lightbox, and Assets preview.
