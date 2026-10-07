# Search & AI visibility (SEO)

Nothing here can *guarantee* a #1 ranking: Google, Bing and AI assistants decide that, and no one can promise it.
What the code does is remove every technical obstacle and make the site easy to index, cite and summarise.
What it can't do is in **"Only you can do these"** below, and those steps matter more than any code.

## What the code already does

| Thing | Where |
|---|---|
| Canonical origin (never a preview URL) | `src/lib/site.ts` — `NEXT_PUBLIC_SITE_URL`, else Vercel's production domain, else `https://teachforacause.vercel.app` |
| Title, description, canonical, Open Graph and Twitter tags on every public page | `src/app/layout.tsx`, `src/lib/seo/meta.ts` |
| Share image (1200×630) for search/social/chat previews | `src/app/opengraph-image.tsx`, `twitter-image.tsx` |
| `robots.txt` — public pages open to Google, Bing and AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot…); private areas closed | `src/app/robots.ts` |
| `sitemap.xml` from one list of public pages | `src/app/sitemap.ts`, `src/lib/seo/pages.ts` |
| `/llms.txt` and `/llms-full.txt` — a plain-text summary and FAQ for AI assistants | `src/lib/seo/llms.ts` |
| Structured data (JSON-LD): Organization, WebSite, WebPage, BreadcrumbList, FAQPage | `src/lib/seo/json-ld.tsx` |
| `noindex` for dashboard, admin, onboarding, API, sign-in and one-time token links (meta tag **and** `X-Robots-Tag` header) | `next.config.ts`, layouts |
| IndexNow key (Bing, Yandex, Seznam, Naver) + submit script | `public/e8eceb997aa1bd0bd74a14ee9620cfc0.txt`, `scripts/indexnow.mjs` |

Adding a public page? Add it to `PUBLIC_PAGES` in `src/lib/seo/pages.ts` (sitemap, llms.txt and IndexNow pick it up) and give it `pageSeo(...)` metadata.
Adding a signed-in or token page? Put its prefix in `PRIVATE_PATHS` and `PRIVATE_SOURCES`.

## Only you can do these

These need your accounts, so the code can't do them for you.

1. **Google Search Console** → add property → URL prefix `https://teachforacause.vercel.app` → copy the code from the *HTML tag* method → set Vercel env `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (code only) → redeploy → Verify → **Sitemaps** → submit `sitemap.xml`. Then use *URL Inspection → Request indexing* for the home page.
2. **Bing Webmaster Tools** → add site (or import from Search Console) → *HTML meta tag* → set `NEXT_PUBLIC_BING_SITE_VERIFICATION` → redeploy → Verify → submit the sitemap. Bing's index also feeds ChatGPT search, Copilot and DuckDuckGo, so this one is worth the five minutes.
3. **Submit to IndexNow after each deploy** that changes content: `node scripts/indexnow.mjs` (checks that the key file is live first).
4. **Get a real domain** ([DOMAIN.md](DOMAIN.md)). A `*.vercel.app` address is a shared domain with no authority of its own, and it is the single biggest ranking handicap this site has. Setting `NEXT_PUBLIC_SITE_URL` is the only code change needed; also make the old `teachforcharity.vercel.app` → canonical redirect **permanent (308)** in Vercel → Domains, not 307.
5. **Backlinks and mentions** are what move rankings for competitive searches: the partner nonprofit's site, local school music departments, NC band directors' associations, local news, and a Google Business/Nonprofit profile if the program qualifies. Ask each to link to the home page with a plain description.

## Honest expectations

- Searching the exact name "Teach for a Cause" should surface the site within days to weeks after steps 1–3.
- Competing for "free music lessons North Carolina" depends on content depth and links, not tags. Fresh, useful pages (instrument guides, "how to earn volunteer hours as a musician", NC school-district pages) help more than anything else in this repo.
- FAQ rich results in Google are limited to government and health sites; the FAQPage data is there mainly for AI assistants and other engines.
- `llms.txt` is an emerging convention; no major engine has confirmed they rely on it. It's cheap, and it can't hurt.
- Counting AI-crawler access as a "ranking factor" is a stretch: it makes the site *eligible* to be quoted, nothing more.
