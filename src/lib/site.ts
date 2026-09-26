/** Program identity. Change the name here and it changes everywhere. */
export const SITE = {
  name: "Teach for a Cause",
  shortName: "Teach for a Cause",
  tagline: "Free music lessons, taught by high schoolers, for middle schoolers across North Carolina.",
  region: "North Carolina",
  timezone: "America/New_York",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
} as const;

export function contactLine(): string {
  return SITE.contactEmail ? SITE.contactEmail : "the program administrator (use “Report a concern” in your dashboard)";
}
