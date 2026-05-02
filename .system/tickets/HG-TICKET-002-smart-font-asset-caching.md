# HG-TICKET-002: Smart caching for vendored fonts

**Spec:** `.system/specs/HG-SPEC-001-vendored-font-system.md`
**Status:** Done  
**Priority:** Medium  
**Size:** M

## Goal

Keep full vendored fonts, avoid subsetting, and make long-term browser caching safe by cache-busting font URLs with manifest SHA256.

## Problem

Fonts are served with:

```http
Cache-Control: public, max-age=31536000, immutable
```

But CSS currently references stable filenames:

```css
/fonts/roboto-flex/RobotoFlex.woff2
```

If font bytes change, browsers can keep old bytes for a year.

## Scope

1. Keep full `.woff2` fonts.
2. Keep immutable cache for `/fonts/**` binary assets.
3. Add SHA query params to CSS font URLs:

```css
/fonts/roboto-flex/RobotoFlex.woff2?v=<sha12>
```

4. Update `scripts/update-fonts.ts` so `just fonts-update` rewrites CSS cache-busters after manifest checksums update.
5. Ensure server ignores query while serving static files.
6. Add tests proving CSS URLs match manifest SHA prefixes and query URLs serve correctly.

## Acceptance criteria

- [x] `public/style.css` font URLs include `?v=<first 12 sha chars>`.
- [x] `scripts/update-fonts.ts` updates font URL query params after downloads.
- [x] Static tests compare CSS query params against `fonts.manifest.json` SHA256.
- [x] Integration tests fetch font URL with query param and get `200`, `font/woff2`, immutable cache.
- [x] No Google font runtime URLs.
- [x] `just check`, `just test-unit`, `just test-integration` pass.

## Completion notes

- E2E still passes with cache-busted font URLs.
- Existing server pathname routing already ignores query strings; integration coverage added.
