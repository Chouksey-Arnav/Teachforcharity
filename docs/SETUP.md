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
- Consider enabling **leaked password protection** (Auth → Settings).

---

## 3. Brevo

1. Create a free account at brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders** → add and verify your sender address. For best deliverability, authenticate a domain you own (DKIM/SPF) once you have one — see `DOMAIN.md`.
3. Create the **API key** (for the app). No SMTP key is needed — Supabase no longer sends the site's emails.

---

## 4. Make yourself the admin

1. Sign up on the live site like a family (use your real email) and enter the 6-digit code you're emailed. You don’t need to finish the questionnaire.
2. Supabase → **SQL Editor** → run:
```sql
update public.profiles set role = 'admin' where email = 'YOUR-EMAIL@example.com';
```
3. Reload `/dashboard`. You now have the admin console. Every other admin or **partner reviewer** can be promoted from **Dashboard → Settings & roles** (they sign up first, then you set their role).

---

## 5. Timely email delivery (reminders & retries)

Emails from user actions go out immediately. Reminder emails (day-before, “log your lesson”, “confirm the lesson”) and retries are queued every 15 minutes by the database and sent when the worker runs. Vercel’s free plan only allows a **daily** cron, so let Supabase call the worker every 2 minutes instead. In the SQL Editor (replace both placeholders):

```sql
create extension if not exists pg_net;
select vault.create_secret('PASTE-YOUR-CRON_SECRET', 'email_cron_secret');
select cron.schedule('tfac-email-drain', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://YOUR-SITE-URL/api/cron/email',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$$);
```
If you change domains, re-run the `cron.schedule` line with the new URL (same job name updates it).

---

## 6. Set the current cause

Dashboard → **Partner & cause**. DOC NC is pre-filled but marked **not confirmed**, with no donation link. Only add a donation URL the nonprofit gives you, and only tick “Partnership confirmed” once they’ve formally agreed.

---

## 7. Verify it works

- Run `supabase/tests/e2e_program_test.sql` in the SQL Editor. Expected output: `ERROR: ALL TESTS PASSED (rolled back): ...` (it deliberately errors to roll back all test data).
- Sign up a test tutor and family with real inboxes you control, and walk one lesson through request → accept → log → confirm → verify.
- Dashboard → **Email log** should show everything as `sent`.

## Plan limits worth knowing
- **Supabase Free** pauses a project after 7 days without activity and has no backups. Before real families rely on it, move to **Pro ($25/mo)** — you get daily backups and no pausing.
- **Vercel Hobby** is for non-commercial use; a free volunteer program fits, but confirm against Vercel’s current terms.
