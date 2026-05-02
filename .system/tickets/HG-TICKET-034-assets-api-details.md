# HG-TICKET-034 — Assets API details and download URL

**Spec:** `.system/specs/HG-SPEC-008-useful-create-assets-ui.md`  
**Status:** Blocked  
**Priority:** High  
**Size:** M  
**Depends:** `HG-TICKET-033-asset-params-db.md`

## Goal

Return enough asset metadata for a useful library card.

## Scope

- `/assets` returns parsed `params`, `url`, `download_url`, type/tool/mime/size/created.
- Keep URLs compatible with current/session or DB-first active flow.
- Do not expose filesystem paths.

## Tests

- Server integration: `/assets` includes params/url/download_url.
- Server integration: malformed params_json fails loud or returns explicit error per boundary.

## Devil check

Do not make frontend parse DB internals or infer file paths.
