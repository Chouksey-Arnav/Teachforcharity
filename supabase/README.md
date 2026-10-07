# Database

All migrations in `migrations/` are **already applied** to the production project (`nkpdiglnyqgblqcqvbdp`). They are kept here as the source of truth and to rebuild the database from scratch (e.g. `supabase db push` against a new project, in filename order).

- `…0100_core_schema` — tables, enums, constraints (incl. no-double-booking exclusion constraints), indexes
- `…0200_security` — signup hook, row-level security on every table, column-level grants
- `…0300_program_logic` — every business rule as a Postgres function (onboarding, consent gate, scheduling, messaging filter, hour verification, safety reports, admin tools, email outbox, maintenance)
- `…0400_storage_realtime_cron_seed` — avatar bucket, realtime, pg_cron maintenance job, instruments, quick-message templates, current partner
- `…0500_related_instruments` — related-instrument groups (e.g. clarinet ↔ saxophone)
- `…0600_review_fixes` — no student hard-deletes, log only after a lesson ends, capacity re-checked on accept, no automatic resend of emails with unknown delivery state

- `…20261007000200_public_waitlist_contact` — public tutor counts per instrument, the no-account waitlist (emailed once when a matching tutor goes live), the public contact form, invitation links a student copies for a parent, and their retention job

Migrations after the first six are applied by hand (Supabase SQL editor, or `supabase db push`). Apply each one **before** deploying the code that uses it; the site degrades gracefully without it (no tutor counts, and the waitlist and contact forms say they aren’t available).

`tests/e2e_program_test.sql` exercises all of it as real roles (including attacks) and rolls back.
