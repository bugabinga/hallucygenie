---
{ "status": "fixed", "specs": ["HG-SPEC-010"] }
---

Firefox Create→Search with `https://youtu.be/dQw4w9WgXcQ` plus same watch URL in results rendered duplicate YouTube metadata blocks.
Cause: de-dupe used raw URL, not video id.
Fix: de-dupe oEmbed enrichment by YouTube video id; first source URL wins; unit + integration coverage added.
