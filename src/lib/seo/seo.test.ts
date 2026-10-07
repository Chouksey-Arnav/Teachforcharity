import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PRIVATE_PATHS, PUBLIC_PAGES } from "@/lib/seo/pages";
import { llmsFullTxt, llmsTxt } from "@/lib/seo/llms";
import { JsonLd, faqJsonLd } from "@/lib/seo/json-ld";
import { renderToStaticMarkup } from "react-dom/server";

describe("seo", () => {
  it("never lists a private path in the sitemap, llms.txt or the page list", () => {
    const urls = sitemap().map((s) => s.url);
    for (const p of PRIVATE_PATHS) {
      expect(urls.some((u) => u.includes(p.replace(/\/$/, "") + "/") || u.endsWith(p.replace(/\/$/, "")))).toBe(false);
      expect(llmsTxt()).not.toContain(p);
    }
    expect(PUBLIC_PAGES.every((p) => !PRIVATE_PATHS.some((x) => p.path.startsWith(x.replace(/\/$/, ""))))).toBe(true);
  });

  it("repeats the private-path blocks for every named bot and lets AI crawlers in", () => {
    const rules = robots().rules as { userAgent: string | string[]; allow?: string; disallow?: string | string[] }[];
    const bots = rules.flatMap((r) => (Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent]));
    for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Bingbot", "Googlebot", "Google-Extended"]) expect(bots).toContain(bot);
    for (const r of rules) {
      expect(r.allow).toBe("/");
      expect(r.disallow).toEqual(PRIVATE_PATHS);
    }
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("sitemap URLs are unique absolute URLs", () => {
    const urls = sitemap().map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u).toMatch(/^https?:\/\//);
  });

  it("llms files describe the program", () => {
    expect(llmsTxt()).toMatch(/^# Teach for a Cause/);
    expect(llmsFullTxt()).toContain("Does it really cost nothing?");
  });

  it("JSON-LD cannot break out of its script tag", () => {
    const html = renderToStaticMarkup(JsonLd({ data: faqJsonLd([{ q: "</script><b>x", a: "y" }]) }));
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});
