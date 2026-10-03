# Database

All migrations in `migrations/` up to `20260928000800_legal_v2` are **already applied** to the production project (`nkpdiglnyqgblqcqvbdp`).

> **Not yet applied: `20261003000100_signed_form_verification`** (parents can upload a photo of the consent form signed in ink instead of taking a call). Apply it **before** deploying the app code that ships with it: the new pages read its columns, so new code on the old database breaks the parent dashboard. The old code keeps working on the new database. Test: `supabase/tests/signed_form_test.sql`.

They are kept here as the source of truth and to rebuild the database from scratch (e.g. `supabase db push` against a new project, in filename order).

- `…0100_core_schema` — tables, enums, constraints (incl. no-double-booking exclusion constraints), indexes
- `…0200_security` — signup hook, row-level security on every table, column-level grants
- `…0300_program_logic` — every business rule as a Postgres function (onboarding, consent gate, scheduling, messaging filter, hour verification, safety reports, admin tools, email outbox, maintenance)
- `…0400_storage_realtime_cron_seed` — avatar bucket, realtime, pg_cron maintenance job, instruments, quick-message templates, current partner
- `…0500_related_instruments` — related-instrument groups (e.g. clarinet ↔ saxophone)
- `…0600_review_fixes` — no student hard-deletes, log only after a lesson ends, capacity re-checked on accept, no automatic resend of emails with unknown delivery state

`tests/e2e_program_test.sql` exercises all of it as real roles (including attacks) and rolls back.
