# Teach for a Cause

Free, one-on-one band and orchestra lessons for North Carolina middle schoolers, taught over Google Meet by high school volunteers who earn volunteer hours verified by a partner nonprofit.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage, Realtime, pg_cron) · Brevo (transactional email) · Vercel.

## What’s in here

| Area | Where |
|---|---|
| Database schema, security (RLS), and all program rules | `supabase/migrations/` |
| End-to-end database test (runs every role, then rolls back) | `supabase/tests/e2e_program_test.sql` |
| Matching algorithm + property-based stress tests | `src/lib/matching/` |
| Email templates, Brevo worker, calendar invites | `src/lib/email/` |
| Public site, legal pages | `src/app/(site)/`, `src/content/legal.tsx` |
| Questionnaires (student, parent + tutor onboarding) | `src/app/onboarding/` |
| Message safety scanner (rule-based, no AI/API) + tests | `src/lib/safety/` |
| Parent approval links & parent portal | `src/app/(site)/guardian/` |
| Password-protected admin console | `src/app/admin/`, `src/lib/admin/` |
| Dashboards (student/parent, tutor, partner reviewer) | `src/app/dashboard/` |

## How the system is designed

- **The database is the referee.** Every rule — consent before lessons, no double-booking, 8 AM–10 PM lesson window, tutor capacity, message filtering, the log → confirm → verify hour chain, auto-pausing a tutor on a safety report — is enforced in Postgres functions. The website can’t bypass them, and neither can someone calling the API directly.
- **Contact details never cross roles.** Families see a tutor’s first name + last initial, never their email/phone/guardian info; tutors never see a family’s contact info or last name; the Meet link only appears for booked lessons.
- **Students can sign themselves up, but a parent unlocks everything.** A student account can't message anyone, request lessons, or be seen by tutors until a parent approves through an emailed link. Only a hash of that link is stored. Unapproved accounts are deleted after 14 days. From the link, parents can read every message and withdraw consent, report, or delete. Parents can also run the account themselves.
- **Tutors go live automatically** and are paused automatically by a safety report or a serious safety-scan flag.
- **Every message is scanned** by a rule-based pipeline (`src/lib/safety/`) right after it's sent and again on a schedule. It needs no AI or outside API. It handles text normalisation (look-alike letters, leetspeak, spaced-out words), a music-aware lexicon, negation, and conversation-level patterns. Flags land in the admin console.
- **Everything is logged by the database**, including sign-ins, consent changes, tutor status, reports, flags and admin logins, in an append-only activity log that the admin console reads.
- **Emails use an outbox.** Actions queue emails in the database; a worker sends them through Brevo with retries and de-duplication, so an email is never lost or sent twice.
- **No money, ever.** Donations are a link-out to the partner nonprofit’s own page.

## Local development

```bash
cp .env.example .env.local   # fill in values (see docs/SETUP.md)
npm install
npm run dev                  # http://localhost:3000
npm test                     # 199 unit + property tests (matching, safety scanner, filters, time zones, emails, admin session)
npm run typecheck
```

## Deploying & configuring

1. **[docs/SETUP.md](docs/SETUP.md)** — Supabase auth settings, Brevo, Vercel env vars, making yourself admin, scheduled email delivery. Do this first.
2. **[docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)** — what must be true before real families use it.
3. **[docs/DOMAIN.md](docs/DOMAIN.md)** — connecting a custom domain through Cloudflare later.
