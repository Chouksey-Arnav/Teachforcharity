# Teach for a Cause

Free, one-on-one band and orchestra lessons for North Carolina middle schoolers, taught over Google Meet by high school volunteers who earn volunteer hours verified by a partner nonprofit.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage, Realtime, pg_cron) · Brevo (transactional email) · Vercel.

## What’s in here

| Area | Where |
|---|---|
| Database schema, security (RLS), and all program rules | `supabase/migrations/` |
| Database tests (run every role, then roll back) | `supabase/tests/*.sql` |
| Browser end-to-end tests against the local stack | `tests/e2e/` |
| Matching algorithm + property-based stress tests | `src/lib/matching/` |
| Email templates, Brevo worker, calendar invites | `src/lib/email/` |
| Public site, legal pages | `src/app/(site)/`, `src/content/legal.tsx` |
| Questionnaires (student, parent + tutor onboarding) | `src/app/onboarding/` |
| Message safety scanner (rule-based, no AI/API) + tests | `src/lib/safety/` |
| Parent approval links & parent portal | `src/app/(site)/guardian/` |
| Admin console (admin accounts with two-factor sign-in) | `src/app/admin/`, `src/lib/admin/` |
| Phone notifications (web push) and the installable app | `src/lib/push/`, `public/sw.js`, `src/app/manifest.ts` |
| Dashboards (student/parent, tutor, partner reviewer) | `src/app/dashboard/` |

## How the system is designed

- **The database is the referee.** Every rule — consent before lessons, no double-booking, 8 AM–10 PM lesson window, tutor capacity, message filtering, the log → confirm → verify hour chain, auto-pausing a tutor on a safety report — is enforced in Postgres functions. The website can’t bypass them, and neither can someone calling the API directly.
- **Contact details never cross roles.** Families see a tutor’s first name + last initial, never their email/phone/guardian info; tutors never see a family’s contact info or last name; the Google Meet link is only handed out from 15 minutes before a booked lesson until 15 minutes after, after the family confirms a parent is nearby, and never by email.
- **Parents make students' accounts.** A student who tries to sign up can only send their parent an invitation. The parent creates the account, adds the student and signs consent, and with the phone check on (the default) nothing unlocks until an admin has called the parent to confirm. Parents can read every message and withdraw consent at any time.
- **Tutors need their parent's approval and an admin's** before families can see them. The parent approves from an emailed link and can withdraw it from the same link. A safety report or a serious safety-scan flag pauses a tutor automatically.
- **Every message is scanned** by a rule-based pipeline (`src/lib/safety/`) right after it's sent and again on a schedule. It needs no AI or outside API. It handles text normalisation (look-alike letters, leetspeak, spaced-out words), a music-aware lexicon, negation, and conversation-level patterns. Flags land in the admin console.
- **Everything is logged by the database**, including sign-ins, consent changes, tutor status, reports, flags and admin logins, in an append-only activity log that the admin console reads.
- **Emails use an outbox.** Actions queue emails in the database; a worker sends them (Gmail SMTP or Brevo) with retries and de-duplication, so an email is never lost or sent twice. Opted-in devices get a phone notification for the same events, after the email is sent.
- **No money, ever.** Donations are a link-out to the partner nonprofit’s own page.

## Local development

```bash
cp .env.example .env.local   # fill in values (see docs/SETUP.md)
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit + property tests (matching, safety scanner, open times, time zones, emails, signed links, push)
npm run typecheck
```

The full local stack (database, auth, a local mail inbox) runs with `npx supabase start`. Point `.env.local` at it with `EMAIL_PROVIDER=smtp` and SMTP host `127.0.0.1`, port `54325`. Run the database tests with `psql` against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, and the browser tests with `node tests/e2e/journey.mjs` (see the header of each file).

## Deploying & configuring

1. **[docs/SETUP.md](docs/SETUP.md)** — Supabase auth settings, email, Vercel env vars, making yourself admin (with two-factor), scheduled jobs. Do this first.
2. **[docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)** — what must be true before real families use it.
3. **[docs/DOMAIN.md](docs/DOMAIN.md)** — connecting a custom domain through Cloudflare later.
