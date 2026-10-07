import { OG_PAGES, OG_SIZE, ogAlt, renderOgImage } from "@/lib/seo/og";

export const alt = ogAlt("how");
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage(OG_PAGES.how);
}
