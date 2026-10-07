import { OG_PAGES, OG_SIZE, ogAlt, renderOgImage } from "@/lib/seo/og";

export const alt = ogAlt("home");
export const size = OG_SIZE;
export const contentType = "image/png";

// The share card for the home page, and for any page without its own.
export default function Image() {
  return renderOgImage(OG_PAGES.home);
}
