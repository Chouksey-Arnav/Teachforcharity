/** The live production address; used only when no URL is configured on a production build. */
const PRODUCTION_FALLBACK = "https://teachforacause.vercel.app";

/**
 * Old addresses that only redirect to the live one. A canonical tag, og:url or og:image on one of these sends
 * every crawler and link preview through a 307, and many previewers drop an image behind a redirect.
 */
const REDIRECTING_HOSTS = ["teachforcharity.vercel.app"];

/**
 * The canonical public origin. Canonical tags, the sitemap, Open Graph and structured data all derive from it,
 * so it must never be a preview deployment's URL: NEXT_PUBLIC_SITE_URL wins, then the live address in
 * production, then localhost for development. Vercel's own project domain is not used: for this project it
 * is the old address that redirects.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured && !REDIRECTING_HOSTS.some((h) => configured.replace(/^https?:\/\//, "").toLowerCase() === h)) return configured;
  return env.NODE_ENV === "production" ? PRODUCTION_FALLBACK : "http://localhost:3000";
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
