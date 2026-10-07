# Teach for a Cause

Free, one-on-one band and orchestra lessons for North Carolina middle schoolers, taught over Google Meet by high school volunteers who earn volunteer hours verified by a partner nonprofit.

> **Changing any UI? Read [MUST_READ.md](MUST_READ.md) first.** Every screen uses the HeyLemon design system (Source Serif 4 / Inter / Geist Mono, cream and ink pills, soft spring animations).

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
| Automated tutor account check (identity, profile, every message, conduct, attendance) + tests | `src/lib/verification/`, `/admin/checks` |
| Parent approval links & parent portal | `src/app/(site)/guardian/` |
| Admin console (admin accounts with two-factor sign-in) | `src/app/admin/`, `src/lib/admin/` |
| Phone notifications (web push) and the installable app | `src/lib/push/`, `public/sw.js`, `src/app/manifest.ts` |
| Dashboards (student/parent, tutor, partner reviewer) | `src/app/dashboard/` |

## How the system is designed

- **The database is the referee.** Every rule — consent before lessons, no double-booking, 8 AM–10 PM lesson window, tutor capacity, message filtering, the log → confirm → verify hour chain, auto-pausing a tutor on a safety report — is enforced in Postgres functions. The website can’t bypass them, and neither can someone calling the API directly.
- **Contact details never cross roles.** Families see a tutor’s first name + last initial, never their email/phone/guardian info; tutors never see a family’s contact info or last name; the Google Meet link is only handed out from 15 minutes before a booked lesson until 15 minutes after, after the family confirms a parent is nearby, and never by email.
- **Parents make students' accounts.** A student who tries to sign up can only send their parent an invitation, with an optional short note (screened by the message filter and the safety analyzer). The email links to a page about the program (`/invite/<token>`) that walks the parent into sign-up. The parent verifies their email with a code, adds the student and signs consent, and lessons unlock as soon as they sign. No phone calls. Parents can read every message and withdraw consent at any time.
- **Tutors need their parent's approval and must pass the automated account check** before families can see them. Nobody approves tutors by hand. The check (`src/lib/verification/`) runs when a tutor signs up or edits their profile, hourly for anyone waiting, and over every tutor account daily. It reads names and parent details (catching self-approval through Gmail dot or +tag aliases), the bio, school and Meet link, every message in the tutor's conversations from the last 30 days (one by one and as whole conversations, including a student telling the tutor to stop), open flags and reports, and attendance. Verified tutors go live on their own. Exceptions go to **Admin → Account checks**, and serious signals pause the tutor. An admin making a tutor live clears those findings so the daily run doesn't undo it, and the check never lifts a pause. The parent approves from an emailed link and can withdraw it from the same link.
- **Volunteer hours are verified twice, and only the second step is by hand.** The tutor logs the lesson and confirms the log is truthful. The next time the student's (or parent's) account opens the site, a check-in asks "Was your tutor there?", with no email involved. Yes counts as student-verified and the tutor sees "you're good to go". No marks the lesson disputed: it never counts, the tutor sees "your student said you weren't there", and admins are alerted with whether each side opened the lesson. The partner nonprofit then certifies student-verified lessons weekly. Only certified hours go on the printable record.
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
3. **[docs/SEO.md](docs/SEO.md)** — search and AI-crawler setup: what the code already does, and the few steps only the site owner can do (Search Console, Bing, IndexNow).
4. **[docs/DOMAIN.md](docs/DOMAIN.md)** — connecting a custom domain through Cloudflare later.
