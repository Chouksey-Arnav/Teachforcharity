# Database

**Production (`nkpdiglnyqgblqcqvbdp`) is behind.** As of October 3, 2026 it has only the migrations up to `20260927000400_scheduled_jobs` (its history records them under different version numbers, applied with comments stripped; the schema matches). These are **not yet applied**, and the deployed `main` already depends on the first eight:

`20260928000100` … `20260928000800`, `20261003000100_signed_form_verification`, `20261003000200_service_role_profile_read`

Apply them in filename order, **before** deploying code that needs them (old code keeps working on the new database; new code on the old one breaks the parent dashboard). They were rehearsed on an exact copy of production (same functions, grants, default privileges and RLS event trigger) and all database tests pass there.

> **Hosted projects are stricter than the local stack.** On production, new functions are callable by nobody and new tables are unreadable by `service_role` unless a migration grants it. The local stack grants both by default, so a missing `grant` passes every local test and fails in production. Grant explicitly in every migration.

> **Don't use `supabase db push` against production** until the history is reconciled: production recorded the September 26 migrations under different version numbers, so `db push` would try to apply them again.

They are kept here as the source of truth and to rebuild the database from scratch (e.g. `supabase db push` against a new project, in filename order).

- `…0100_core_schema` — tables, enums, constraints (incl. no-double-booking exclusion constraints), indexes
- `…0200_security` — signup hook, row-level security on every table, column-level grants
- `…0300_program_logic` — every business rule as a Postgres function (onboarding, consent gate, scheduling, messaging filter, hour verification, safety reports, admin tools, email outbox, maintenance)
- `…0400_storage_realtime_cron_seed` — avatar bucket, realtime, pg_cron maintenance job, instruments, quick-message templates, current partner
- `…0500_related_instruments` — related-instrument groups (e.g. clarinet ↔ saxophone)
- `…0600_review_fixes` — no student hard-deletes, log only after a lesson ends, capacity re-checked on accept, no automatic resend of emails with unknown delivery state

`tests/e2e_program_test.sql` exercises all of it as real roles (including attacks) and rolls back.
