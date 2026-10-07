// Tells Bing, Yandex, Seznam, Naver and other IndexNow engines that pages changed, so they crawl now instead of later.
// Run after a deploy:  node scripts/indexnow.mjs [https://your-site.example]
// The key file is public/<key>.txt and must be live at <site>/<key>.txt before this works.
import { readdirSync, readFileSync } from "node:fs";

const KEY = readdirSync("public").find((f) => /^[a-f0-9]{32}\.txt$/.test(f))?.replace(".txt", "");
if (!KEY) throw new Error("No IndexNow key file (public/<32 hex>.txt) found.");

const site = (process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://teachforacause.vercel.app").replace(/\/+$/, "");
const host = new URL(site).host;

const sitemap = await (await fetch(`${site}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) throw new Error(`No URLs found in ${site}/sitemap.xml. Is the site deployed?`);

const keyCheck = await fetch(`${site}/${KEY}.txt`);
if (!keyCheck.ok || (await keyCheck.text()).trim() !== KEY) throw new Error(`${site}/${KEY}.txt is not serving the key yet. Deploy first.`);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs (200/202 = accepted)`);
if (res.status >= 400) process.exit(1);
