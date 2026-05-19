---
{ "status": "open", "specs": ["HG-SPEC-001", "HG-SPEC-011"] }
---

# HG-ISSUE-083: Static path prefix boundary weak

Repro:

- Review `serveStaticFile()` path containment check.
- Compare resolved paths for `public` and sibling prefix names like `public_evil`.

Observed:

- Containment uses `filePath.startsWith(publicDir)`.
- Prefix checks can accept sibling paths that share the same prefix.

Expected:

- Static serving is limited to `public/` exactly.

Cause:

- String prefix boundary lacks path separator check.

Fix:

- Use `filePath === publicDir || filePath.startsWith(publicDir + sep)`.
- Keep traversal tests for `..`, encoded paths, absolute-looking paths, and sibling-prefix paths.
