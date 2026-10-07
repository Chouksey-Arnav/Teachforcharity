# Browser end-to-end tests

Drive the real site in Chromium against the **local** Supabase stack (they read the local mail inbox and use `psql` for a few shortcuts, so never point them at production).

| Test | Covers |
|---|---|
| `admin-mfa.mjs` | admin sign-in with an authenticator app: setup, wrong codes, password-only sessions refused |
| `auth.mjs` | sign-up codes, breached passwords, no account enumeration, new-device alerts, safe redirects |
| `parent-first.mjs` | a student invites a parent with a note; the parent opens the invitation page, signs up and signs consent, and lessons unlock at once |
| `tutor-approval.mjs` | a tutor's parent approves (and withdraws) from the emailed link; admin approval |
| `journey.mjs` | the whole program: weekly booking from open times, counter-offer, joining only in the window, practice notes, one-tap email confirmation, verification, the public hours link |
| `safety.mjs` | run after `journey.mjs`: every public page, messaging filter, a partner reviewer, report → auto-pause → reactivate, every page on a phone |
| `student-experience.mjs` | run after `journey.mjs`: finding a tutor (search, day/schedule filters, sort kept in the URL), booking from a time on a tutor card, messaging from a profile, home next lesson + “Your tutors”, phone layout |
| `landing.mjs` | run after `journey.mjs`: the landing page's first screen on five sizes (what it is, one sign-up choice per person, sign in), each choice opening the right sign-up, the signed-in "welcome back" top (next lesson, one tap to the dashboard), signing out from it, an unfinished sign-up sent back to finish |
| `a11y.mjs` | run after `journey.mjs`: axe-core scan (WCAG 2.1 AA) of public and signed-in pages |

```bash
npx supabase start                        # local stack; .env.local points at it (see README)
npm run build && npm start                # or npm run dev
npm i --no-save playwright @axe-core/playwright
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f tests/e2e/cleanup.sql -f tests/e2e/setup.sql
rm -f tests/e2e/screenshots/.admin-totp.json
node tests/e2e/journey.mjs                # then safety.mjs, student-experience.mjs, landing.mjs and a11y.mjs
```

Run `cleanup.sql` + `setup.sql` before each of the other tests. Test accounts are on `@tfac-e2e.test` with password `E2eTest-2026`. If Chromium isn't found, set `CHROME_PATH`.
