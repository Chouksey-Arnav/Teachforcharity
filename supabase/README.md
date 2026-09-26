# Database

All migrations in `migrations/` are **already applied** to the production project (`nkpdiglnyqgblqcqvbdp`). They are kept here as the source of truth and to rebuild the database from scratch (e.g. `supabase db push` against a new project, in filename order).

- `…0100_core_schema` — tables, enums, constraints (incl. no-double-booking exclusion constraints), indexes
- `…0200_security` — signup hook, row-level security on every table, column-level grants
- `…0300_program_logic` — every business rule as a Postgres function (onboarding, consent gate, scheduling, messaging filter, hour verification, safety reports, admin tools, email outbox, maintenance)
- `…0400_storage_realtime_cron_seed` — avatar bucket, realtime, pg_cron maintenance job, instruments, quick-message templates, current partner
- `…0500_related_instruments` — related-instrument groups (e.g. clarinet ↔ saxophone)

`tests/e2e_program_test.sql` exercises all of it as real roles (including attacks) and rolls back.
