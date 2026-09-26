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
| Questionnaires (family + tutor onboarding) | `src/app/onboarding/` |
| Dashboards (family, tutor, partner reviewer, admin) | `src/app/dashboard/` |

## How the system is designed

- **The database is the referee.** Every rule — consent before lessons, no double-booking, 8 AM–10 PM lesson window, tutor capacity, message filtering, the log → confirm → verify hour chain, auto-pausing a tutor on a safety report — is enforced in Postgres functions. The website can’t bypass them, and neither can someone calling the API directly.
- **Contact details never cross roles.** Families see a tutor’s first name + last initial, never their email/phone/guardian info; tutors never see a family’s contact info or last name; the Meet link only appears for booked lessons.
- **The parent owns the family account** (students under 13 never have accounts), and holds every message thread.
- **Emails use an outbox.** Actions queue emails in the database; a worker sends them through Brevo with retries and de-duplication, so an email is never lost or sent twice.
- **No money, ever.** Donations are a link-out to the partner nonprofit’s own page.

## Local development

```bash
cp .env.example .env.local   # fill in values (see docs/SETUP.md)
npm install
npm run dev                  # http://localhost:3000
npm test                     # 93 unit + property tests (matching, filters, time zones, emails)
npm run typecheck
```

## Deploying & configuring

1. **[docs/SETUP.md](docs/SETUP.md)** — Supabase auth settings, Brevo, Vercel env vars, making yourself admin, scheduled email delivery. Do this first.
2. **[docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)** — what must be true before real families use it.
3. **[docs/DOMAIN.md](docs/DOMAIN.md)** — connecting a custom domain through Cloudflare later.
