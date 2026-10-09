# Database

All migrations in `migrations/` are **already applied** to the production project (`nkpdiglnyqgblqcqvbdp`). They are kept here as the source of truth and to rebuild the database from scratch (e.g. `supabase db push` against a new project, in filename order).

- `…0100_core_schema` — tables, enums, constraints (incl. no-double-booking exclusion constraints), indexes
- `…0200_security` — signup hook, row-level security on every table, column-level grants
- `…0300_program_logic` — every business rule as a Postgres function (onboarding, consent gate, scheduling, messaging filter, hour verification, safety reports, admin tools, email outbox, maintenance)
- `…0400_storage_realtime_cron_seed` — avatar bucket, realtime, pg_cron maintenance job, instruments, quick-message templates, current partner
- `…0500_related_instruments` — related-instrument groups (e.g. clarinet ↔ saxophone)
- `…0600_review_fixes` — no student hard-deletes, log only after a lesson ends, capacity re-checked on accept, no automatic resend of emails with unknown delivery state

- `…20261007000200_public_waitlist_contact` — public tutor counts per instrument, the no-account waitlist (emailed once when a matching tutor goes live), the public contact form, invitation links a student copies for a parent, and their retention job

- `…20261009000100_message_gate` — the rebuilt message gate (`private.gate_check`, generated from `src/lib/safety/gate.ts`: look-alike letters, invisible characters, leetspeak, spaced letters, spelled-out numbers, plus secrecy/probing/photo/romance requests). Blocked chat messages are recorded in `message_blocks` and flag the safety team. **Never edit the generated block by hand:** change `gate.ts`, then run `GATE_WRITE=1 npx vitest run src/lib/safety/gate-sql.test.ts` (it rewrites the block and `tests/message_gate_test.sql`; the normal test run fails if they drift).
- `…20261009000200_practice_board` — homework tasks and notes from tutor to student (`assignments`, `assign_practice`, `my_practice`, `set_practice_done`), the tutor's `my_students` list, the per-side `lesson_timeline`, admin hiding, and a privacy fix (lesson event notes are no longer readable by the other side)

Migrations after the first six are applied by hand (Supabase SQL editor, or `supabase db push`). Apply each one **before** deploying the code that uses it; the site degrades gracefully without it (no tutor counts, and the waitlist and contact forms say they aren’t available).

`tests/e2e_program_test.sql` exercises all of it as real roles (including attacks) and rolls back.

`tests/message_gate_test.sql` holds the database gate to the same corpus as the site's (same rule, byte-identical normalized text), and `tests/v5_practice_board_test.sql` covers blocked-attempt recording and the practice board as real roles.
