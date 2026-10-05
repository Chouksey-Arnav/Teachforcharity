import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: SITE.name,
    short_name: SITE.name,
    description: "Free online music lessons from high school volunteers.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F8F6EE",
    theme_color: "#F8F6EE",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
