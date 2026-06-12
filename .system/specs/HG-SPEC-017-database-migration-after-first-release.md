# HG-SPEC-017 Database migrations after first release

After v0.1.0, database schema changes require migrations.

Rules:

- Every schema change adds a numbered migration.
- Migrations run on startup before request handling.
- Migrations are deterministic and idempotent through `schema_migrations`.
- Missing/failed migration fails startup loud.
- No destructive migration without explicit backup note in release notes.
- Tests cover:
  - fresh DB reaches latest schema
  - old released DB migrates to latest schema
  - failed migration does not mark version applied
  - app refuses unknown future schema if detected
- Release notes name DB changes in parent-friendly language.
