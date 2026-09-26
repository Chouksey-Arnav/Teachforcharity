# Setup guide

The Supabase database (**Teach For Charity**, project ref `nkpdiglnyqgblqcqvbdp`, us-east-2) is already fully migrated and seeded. These steps connect everything else. Budget ~30 minutes.

---

## 1. Deploy to Vercel

1. vercel.com → **Add New → Project** → import `chouksey-arnav/teachforcharity`. Framework is detected as Next.js; no build settings to change.
2. **Settings → Environment Variables** — add these for *Production* and *Preview*:

| Name | Value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nkpdiglnyqgblqcqvbdp.supabase.co` | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_ccii317AbhJ8WyokT9V5Cg_S8_khA3N` | no (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **secret / service_role** key | **YES** |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://teachforcharity.vercel.app` (no trailing slash) | no |
| `NEXT_PUBLIC_CONTACT_EMAIL` | the address families should contact | no |
| `EMAIL_PROVIDER` | `smtp` for testing (Nodemailer) or `brevo` (default when unset) | no |
| `SMTP_HOST` | *smtp only* — e.g. `smtp.gmail.com` | no |
| `SMTP_PORT` | *smtp only* — `587` (default) or `465` | no |
| `SMTP_SECURE` | *smtp only, optional* — leave unset; `465` implies TLS, `587` uses STARTTLS | no |
| `SMTP_USER` | *smtp only* — the SMTP login (for Gmail: your Gmail address) | no |
| `SMTP_PASS` | *smtp only* — for Gmail a 16-char **App Password** (needs 2-Step Verification) | **YES** |
| `EMAIL_FROM` | *smtp only* — From address (for Gmail: the same Gmail address) | no |
| `EMAIL_FROM_NAME` | *smtp only, optional* — `Teach for a Cause` | no |
| `BREVO_API_KEY` | *brevo only* — Brevo → **SMTP & API → API Keys** (starts `xkeysib-`) | **YES** |
| `BREVO_SENDER_EMAIL` | a sender you verified in Brevo | no |
| `BREVO_SENDER_NAME` | `Teach for a Cause` | no |
| `CRON_SECRET` | any long random string (e.g. `openssl rand -hex 32`) | **YES** |
| `SUPABASE_CRON_SECRET` | the secret Supabase's scheduled jobs send (§5). Must equal the Vault secret `tfac_cron_secret` | **YES** |
| `ADMIN_PASSWORD` | the password for `/admin`. **Set this.** Without it the public fallback `123987` works | **YES** |

3. Redeploy after adding variables.

> Brevo variables can stay set while `EMAIL_PROVIDER=smtp`; they're ignored. Switch back by setting `EMAIL_PROVIDER=brevo` and redeploying. After deploying, use **Admin → Emails → Send test email** to confirm delivery.

> Never put the service-role key, SMTP password, Brevo key, or cron secret in any `NEXT_PUBLIC_` variable or commit them to git.

---

## 2. Supabase Auth settings (Dashboard → Authentication)

### URL configuration
- **Site URL:** your production URL (same as `NEXT_PUBLIC_SITE_URL`).
- **Redirect URLs:** add `https://YOUR-URL/**` and `http://localhost:3000/**`. When you add a custom domain later, add it here too.

### Sign-up and password-reset emails are sent by the app, not Supabase
The site emails a **6-digit code** through the same provider as every other
email (`EMAIL_PROVIDER`: Nodemailer/Gmail for testing, Brevo later). The account
is created in Supabase only **after** the code is entered, already confirmed,
and the person is signed straight in. Nothing to configure in Supabase's email
templates or SMTP for this — the app never asks Supabase to send email.

How it's protected (all in `supabase/migrations/…0700_email_codes.sql`):
- only a keyed hash of each code is stored; codes expire after 10 minutes;
- 5 wrong tries kills the code; max 1 code/minute and 5/hour per email, 20/hour per IP;
- the password is set by whoever enters the code, so nobody can pre-register someone else's email;
- a password reset signs the account out on every other device.

Requires `SUPABASE_SERVICE_ROLE_KEY` plus the email provider variables above. If
either is missing, sign-up shows "Email sign-up isn’t available right now" and
the server log says exactly which variable is missing.

### Password & security
- Authentication → Providers → Email: keep **Confirm email** ON (it only affects anyone bypassing the site; the site creates accounts pre-confirmed after the code). Minimum password length 8.
- Turn on **leaked password protection** (Authentication → Settings / Attack Protection). It rejects passwords found in known breaches.

---

## 3. Brevo

1. Create a free account at brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders** → add and verify your sender address. For best deliverability, authenticate a domain you own (DKIM/SPF) once you have one — see `DOMAIN.md`.
3. Create the **API key** (for the app). No SMTP key is needed — Supabase no longer sends the site's emails.

---

## 4. The admin console (`/admin`)

1. In Vercel, set `ADMIN_PASSWORD` to a long password only you know, and redeploy. (Until you do, the fallback `123987` works and the console shows a red warning. The fallback is published in this repository, so treat it as public.)
2. Go to `https://YOUR-URL/admin` and enter the password. Sessions last 12 hours. Wrong guesses are rate-limited (10 per IP, 50 total per 15 minutes) and every attempt is written to the activity log.
3. **Admin → Settings & health**: add at least one **alert email**. Safety reports and serious safety-scan flags are emailed there. Until one is set, nobody is notified.
4. To change the password, change `ADMIN_PASSWORD` and redeploy. Every open admin session is signed out.

Partner reviewers (who verify volunteer hours) are regular accounts. Ask them to sign up, then enter their email under **Admin → Settings → Partner reviewers**.

---

## 5. Scheduled jobs (email every 2 minutes, safety scan hourly)

Emails from user actions go out immediately. Reminder emails and retries are queued every 15 minutes by the database. Vercel's free plan only runs cron **once a day**, so Supabase calls the app instead:

| Job | Schedule | Calls |
|---|---|---|
| `tfac-maintenance` | every 15 min | database only: expires requests, queues reminders, deletes student accounts not approved in 14 days |
| `tfac-email-drain` | every 2 min | `/api/cron/email` |
| `tfac-safety-scan` | hourly | `/api/cron/safety` |

Migration `20260927000400_scheduled_jobs.sql` enables `pg_net` and schedules the two HTTP jobs. They read two Vault secrets and do nothing until both exist. **These are already set on the production project.** For a new project, run this in the SQL Editor:

```sql
select vault.create_secret('https://YOUR-URL', 'tfac_site_url');            -- no trailing slash
select vault.create_secret('SAME-VALUE-AS-SUPABASE_CRON_SECRET', 'tfac_cron_secret');
```

To change the URL (for example after adding a custom domain):

```sql
select vault.update_secret(id, 'https://new-domain.org') from vault.secrets where name = 'tfac_site_url';
```

To rotate the secret, update `tfac_cron_secret` the same way, set the same value in Vercel as `SUPABASE_CRON_SECRET`, and redeploy.

**Admin → Settings & health** shows each job's last run, and whether any messages are waiting to be scanned. Vercel's daily crons in `vercel.json` stay on as a backup.

---

## 6. Set the current cause

**Admin → Settings → Partner & cause**. DOC NC is pre-filled but marked **not confirmed**, with no donation link. Only add a donation URL the nonprofit gives you, and only tick “Partnership confirmed” once they’ve formally agreed.

---

## 7. Verify it works

- Run `supabase/tests/e2e_program_test.sql` in the SQL Editor. Expected output: `ERROR: ALL TESTS PASSED (rolled back): ...` (it deliberately errors to roll back all test data).
- Sign up a test tutor and family with real inboxes you control, and walk one lesson through request → accept → log → confirm → verify.
- Run `supabase/tests/v2_program_test.sql` the same way (student accounts, parent links, offers, safety scanner, admin erase).
- Sign up a test **student** with a parent email you control. Approve from the emailed link, then check the parent page.
- **Admin → Emails** should show everything as `sent`. **Admin → Settings & health** should be all green.

## Plan limits worth knowing
- **Supabase Free** pauses a project after 7 days without activity and has no backups. Before real families rely on it, move to **Pro ($25/mo)** — you get daily backups and no pausing.
- **Vercel Hobby** is for non-commercial use; a free volunteer program fits, but confirm against Vercel’s current terms.
