/** The live production address; used only when no URL is configured on a production build. */
const PRODUCTION_FALLBACK = "https://teachforacause.vercel.app";

/**
 * The canonical public origin. Canonical tags, the sitemap, Open Graph and structured data all derive from it,
 * so it must never be a preview deployment's URL: NEXT_PUBLIC_SITE_URL wins, then Vercel's production domain,
 * then the live address in production, then localhost for development.
 */
function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const url = configured || (vercel ? `https://${vercel}` : process.env.NODE_ENV === "production" ? PRODUCTION_FALLBACK : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}

/** Program identity. Change the name here and it changes everywhere. */
export const SITE = {
  name: "Teach for a Cause",
  shortName: "Teach for a Cause",
  tagline: "Free music lessons, taught by high schoolers, for middle schoolers across North Carolina.",
  region: "North Carolina",
  timezone: "America/New_York",
  url: siteUrl(),
  description:
    "Free one-on-one band and orchestra lessons for North Carolina middle schoolers, taught over Google Meet by high school musicians earning verified volunteer hours.",
  keywords: [
    "free music lessons",
    "free band lessons North Carolina",
    "free orchestra lessons",
    "online music tutoring for middle school",
    "high school volunteer tutors",
    "volunteer hours for high school students",
    "NHS volunteer hours",
    "Tri-M volunteer hours",
    "middle school band help",
    "free violin lessons",
    "free saxophone lessons",
    "free trumpet lessons",
    "free clarinet lessons",
    "free flute lessons",
  ],
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
} as const;

export function contactLine(): string {
  return SITE.contactEmail ? SITE.contactEmail : "the program administrator (use “Report a concern” in your dashboard)";
}
