import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { PUBLIC_PAGES } from "@/lib/seo/pages";

/** lastModified appears only where we know a real date: a sitemap claiming everything changed today teaches crawlers to ignore it. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({
    url: p.path === "/" ? SITE.url : `${SITE.url}${p.path}`,
    ...(p.lastModified ? { lastModified: p.lastModified } : {}),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
