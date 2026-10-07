import type { Metadata } from "next";
import { SITE } from "@/lib/site";

/** Per-page canonical + social tags. A page's `openGraph` replaces the root one wholesale, so siteName/type/locale are restated here. */
const IMAGE = { url: "/opengraph-image", width: 1200, height: 630 };

export function pageSeo(path: string, title: string, description: string): Pick<Metadata, "title" | "description" | "alternates" | "openGraph" | "twitter"> {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, title: `${title} · ${SITE.name}`, description, type: "website", siteName: SITE.name, locale: "en_US", images: [IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE.name}`, description, images: [IMAGE.url] },
  };
}
