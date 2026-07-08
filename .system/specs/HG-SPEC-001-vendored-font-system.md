# HG-SPEC-001: Vendored 3-font system

## Design decisions

- Playwrite DE SAS → user/steer bubbles + chat input
- Roboto Flex → assistant bubbles + thinking/text
- Pixelify Sans → UI chrome/buttons/labels/header/tool cards
- Vendored locally. No Google Fonts CDN. No runtime font requests.
- `.woff2` only. Variable fonts. `font-display: swap`.
- Reproducible: `public/fonts/fonts.manifest.json` with pinned source commit + SHA256 checksums.
- `mise run fonts` downloads from pinned google/fonts repo commit, converts to woff2, updates manifest.
