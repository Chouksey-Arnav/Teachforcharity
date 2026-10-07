import { LEGAL_DOCS } from "@/content/legal";

/**
 * Every public, indexable page: the single source for the sitemap, llms.txt and the IndexNow script.
 * Private areas (dashboard, admin, onboarding, token links) never belong here.
 */
export interface PublicPage {
  path: string;
  title: string;
  summary: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
  /** ISO date of the last real content change, when we know one (legal documents carry their effective date). */
  lastModified?: string;
}

function isoDate(text: string): string | undefined {
  const t = Date.parse(`${text} 12:00 UTC`);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", title: "Home", summary: "What Teach for a Cause is, who it is for, and how to start.", priority: 1, changeFrequency: "weekly" },
  { path: "/how-it-works", title: "How it works", summary: "How students and tutors are matched, how lessons are scheduled, and how volunteer hours are verified.", priority: 0.9, changeFrequency: "monthly" },
  { path: "/safety", title: "Safety & consent", summary: "Parent consent, message filtering, the Google Meet window and how concerns are handled.", priority: 0.9, changeFrequency: "monthly" },
  { path: "/volunteer", title: "Become a tutor", summary: "High school musicians: teach middle schoolers for free and earn verified volunteer hours.", priority: 0.9, changeFrequency: "monthly" },
  { path: "/cause", title: "The cause", summary: "How families can optionally give back to the nonprofit partner's current cause.", priority: 0.6, changeFrequency: "monthly" },
  { path: "/signup", title: "Create an account", summary: "Parents create the account, add their child and sign consent; tutors sign up with a parent's approval.", priority: 0.8, changeFrequency: "yearly" },
  ...LEGAL_DOCS.map((d) => ({ path: `/legal/${d.slug}`, title: d.title, summary: d.summary, priority: 0.3, changeFrequency: "yearly" as const, lastModified: isoDate(d.effective) })),
];

/** Paths crawlers should never fetch: signed-in areas, APIs and one-time token links. */
export const PRIVATE_PATHS = ["/dashboard/", "/admin/", "/onboarding/", "/api/", "/auth/", "/invite/", "/confirm/", "/verify/", "/guardian/"];
