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

## 3. Email from your domain (big deliverability win)
Emails from a free address (Gmail etc.) often land in spam. With your own domain:
1. Brevo → **Senders, Domains & Dedicated IPs → Domains** → add your domain. Brevo gives you DKIM and SPF (and a Brevo code) records.
2. Add those records in Cloudflare DNS (DNS only).
3. Add a DMARC record: `TXT`, name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:you@yourdomain.org`.
4. Create a sender like `lessons@yourdomain.org`, then update `BREVO_SENDER_EMAIL` in Vercel and the sender in Supabase’s SMTP settings.

## 4. Optional
- Cloudflare Email Routing can forward `hello@yourdomain.org` to your inbox for free — use it as `NEXT_PUBLIC_CONTACT_EMAIL`.
