import type { Metadata } from "next";
import { SITE } from "@/lib/site";

/** The home card, for pages without their own `opengraph-image.tsx`. */
export const DEFAULT_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630 };

/**
 * Per-page canonical + social tags. A page's `openGraph` replaces the root one wholesale, images included, so
 * siteName/type/locale and the home card are restated here. Next only uses a page's own `opengraph-image.tsx` when
 * this object has no `images` key at all, so pages with their own card pass `ownImage` (it then fills og:image and
 * twitter:image itself). seo.test.ts checks every page with a card passes it.
 */
export function pageSeo(
  path: string,
  title: string,
  description: string,
  { ownImage = false }: { ownImage?: boolean } = {},
): Pick<Metadata, "title" | "description" | "alternates" | "openGraph" | "twitter"> {
  const og = { url: path, title: `${title} · ${SITE.name}`, description, type: "website" as const, siteName: SITE.name, locale: "en_US" };
  const tw = { card: "summary_large_image" as const, title: `${title} · ${SITE.name}`, description };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: ownImage ? og : { ...og, images: [DEFAULT_OG_IMAGE] },
    twitter: ownImage ? tw : { ...tw, images: [DEFAULT_OG_IMAGE.url] },
  };
}
