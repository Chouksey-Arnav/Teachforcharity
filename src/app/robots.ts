import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { PRIVATE_PATHS } from "@/lib/seo/pages";

/**
 * Search engines and AI crawlers are welcome on the public pages. Named bots get their own block, and a named
 * block replaces the `*` block for that bot, so the private-path list is repeated for each.
 * Search and answer bots (they cite and link back) and training bots are both allowed on purpose: this is a
 * public-interest program that wants to be found and described accurately.
 */
const AI_AND_SEARCH_BOTS = [
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "cohere-ai",
  "MistralAI-User",
  "Meta-ExternalAgent",
  "Amazonbot",
  "YouBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: AI_AND_SEARCH_BOTS, allow: "/", disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
