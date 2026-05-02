# HG-E2E-012: Residual HTML indentation whitespace in onboarding/create tabs

**Status:** Fixed

**Severity:** Low (cosmetic/accessibility)

## Reproduce

1. Start app: `just dev`
2. Inspect text nodes in `button, p, span, label, h1, h2, h3`
3. Elements still carrying source indentation/newlines:
   - Onboarding slide 3 paragraph: `Generate images...\n                                place!`
   - `.create-tab[data-tab="image"]`
   - `.create-tab[data-tab="search"]`
   - `.create-tab[data-tab="assets"]`

## Hypothesis

Prettier wraps long inline HTML, reintroducing text-node whitespace unless protected with `<!-- prettier-ignore -->` or split into child elements.

## Investigation

Manual Playwright scan found 4 affected elements after previous whitespace fixes.

## Fix

Use single-line `prettier-ignore` markup or move visible labels into child spans where whitespace is controlled.

## Prevent

Extend `test/static.test.ts` to scan all visible text-bearing controls for direct text nodes starting/ending with newlines.
