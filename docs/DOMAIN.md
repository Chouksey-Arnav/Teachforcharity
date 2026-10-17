# Connecting a custom domain (Cloudflare) — for later

Do this once you’ve bought a domain. Nothing in the code needs to change; only settings do.

## 1. Point the domain at Vercel
1. Vercel → Project → **Settings → Domains** → add `yourdomain.org` and `www.yourdomain.org`. Vercel shows the DNS records it needs.
2. Cloudflare → your domain → **DNS**:
   - `A` record, name `@`, value `76.76.21.21` (or whatever Vercel shows)
   - `CNAME` record, name `www`, value `cname.vercel-dns.com`
   - Set both to **DNS only (grey cloud)**. Vercel issues the SSL certificate itself; Cloudflare’s proxy (orange cloud) in front of Vercel causes certificate and caching problems.
3. Wait for Vercel to show both domains as “Valid”. Choose which one redirects to the other (usually `www` → apex).

## 2. Update settings that contain the URL
- Vercel env var `NEXT_PUBLIC_SITE_URL` → `https://yourdomain.org`, then redeploy.
- Supabase → Authentication → URL configuration → **Site URL** → new domain; add `https://yourdomain.org/**` to Redirect URLs (keep the old one until you’re sure).
- Supabase SQL Editor → re-run the `cron.schedule('tfac-email-drain', …)` statement from `SETUP.md` with the new URL.

## 3. Switch email (codes and everything else) to Brevo on your domain
The code is already Brevo-ready: sign-up and reset codes, lesson emails and digests all go through one switch, `EMAIL_PROVIDER`. **Don't switch before you have the domain.** A Brevo sender on a free address (Gmail etc.) gets rejected or spam-foldered by Gmail and Yahoo. About 30 minutes:

1. Brevo → **Senders, Domains & Dedicated IPs → Domains** → add your domain. Add every record Brevo shows (the Brevo code, DKIM and the SPF it asks for) in Cloudflare DNS, **DNS only** (grey cloud). Wait for Brevo to show the domain as authenticated.
2. Add DMARC: `TXT`, name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:you@yourdomain.org`. After about two weeks of clean reports, change `p=none` to `p=quarantine`.
3. Brevo → **Senders** → add `lessons@yourdomain.org`.
4. Brevo → transactional settings → **turn off open and click tracking**. Click tracking rewrites links through Brevo's redirect domain, which can break the single-use links in parent-approval emails (mail scanners open them first), and it tracks children's families for no benefit. Where this setting lives moves around; look for "tracking" under the transactional/SMTP settings.
5. Vercel → environment variables: `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL=lessons@yourdomain.org`, `BREVO_SENDER_NAME=Teach for a Cause`. Keep the Gmail SMTP variables and add `EMAIL_FALLBACK_PROVIDER=smtp`: if Brevo ever fails, a sign-up code still arrives (from Gmail). Redeploy.
6. Admin → Emails → **Send test email**. Then sign up for real with a **Gmail, Outlook, Yahoo, iCloud and an NC school-district address** (tutors often use school email, and school filters are the strictest). Check inbox vs spam and how fast the code arrives.
7. After a quiet week, remove `EMAIL_FALLBACK_PROVIDER` and the Gmail app password if you no longer want Gmail as the backup.

The app never uses Supabase's own mailer, so nothing changes in Supabase's SMTP settings.

**Daily limits.** Codes, lesson emails, reminders and digests all count against your Brevo plan's daily cap (the free plan's is low; check yours in Brevo). The Brevo log shows codes tagged `otp` and everything else `transactional`.

## 4. Optional
- Cloudflare Email Routing can forward `hello@yourdomain.org` to your inbox for free — use it as `NEXT_PUBLIC_CONTACT_EMAIL`.
