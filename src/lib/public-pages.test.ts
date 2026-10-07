import { describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/site";
import { causeReady, confirmedPartner } from "@/lib/cause";
import { supplyStatus, US_STATES } from "@/lib/public-forms";
import { parentPhase } from "@/components/forms/parent-journey";
import { ALL_FAQ, FAQ_GROUPS } from "@/content/faq";
import type { PublicConfig } from "@/lib/viewer";

const partner = (over: Partial<NonNullable<PublicConfig["partner"]>> = {}) =>
  ({
    partner: {
      id: "p",
      name: "Dedicated to Our Community of North Carolina",
      short_name: "DOC NC",
      cause_title: "Community initiatives",
      cause_description: "A real description.",
      donation_url: "https://example.org/give",
      website_url: "https://example.org",
      partnership_confirmed: true,
      ...over,
    },
  }) as unknown as PublicConfig;

describe("siteUrl", () => {
  it("never uses the old address that only redirects", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://teachforcharity.vercel.app/", NODE_ENV: "production" })).toBe("https://teachforacause.vercel.app");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://TeachForCharity.vercel.app", NODE_ENV: "production" })).toBe("https://teachforacause.vercel.app");
  });
  it("honors a real configured domain and strips the trailing slash", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://teachforacause.org/", NODE_ENV: "production" })).toBe("https://teachforacause.org");
  });
  it("ignores Vercel's project domain and falls back sensibly", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "teachforcharity.vercel.app", NODE_ENV: "production" })).toBe("https://teachforacause.vercel.app");
    expect(siteUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
});

describe("cause gating", () => {
  it("hides the cause until a confirmed partner has a donation page and real copy", () => {
    expect(causeReady(null)).toBe(false);
    expect(causeReady(partner())).toBe(true);
    expect(causeReady(partner({ partnership_confirmed: false }))).toBe(false);
    expect(causeReady(partner({ donation_url: null }))).toBe(false);
    expect(causeReady(partner({ cause_description: "  " }))).toBe(false);
  });
  it("only names a partner once the partnership is confirmed", () => {
    expect(confirmedPartner(partner({ partnership_confirmed: false }))).toBeNull();
    expect(confirmedPartner(partner())?.short_name).toBe("DOC NC");
  });
});

describe("instrument supply", () => {
  it("prefers an exact tutor, then a related one, then the waitlist", () => {
    expect(supplyStatus({ open: 2, related: 1 })).toBe("open");
    expect(supplyStatus({ open: 0, related: 1 })).toBe("related");
    expect(supplyStatus({ open: 0, related: 0 })).toBe("waitlist");
  });
  it("lists every state except North Carolina, plus outside the US", () => {
    expect(US_STATES.some((s) => s.code === "NC")).toBe(false);
    expect(US_STATES.find((s) => s.code === "ZZ")?.name).toMatch(/Outside/);
    expect(US_STATES.every((s) => /^[A-Z]{2}$/.test(s.code))).toBe(true);
  });
});

describe("parent journey", () => {
  it("shows four steps from the sign-up page to consent, always moving forward", () => {
    expect(parentPhase(0)).toMatchObject({ current: 0 });
    expect(parentPhase(3).current).toBe(1); // "Step 2 of 4 · Your student"
    expect(parentPhase(7)).toMatchObject({ current: 3, progress: 1 });
    for (let i = 1; i < 8; i++) expect(parentPhase(i).progress).toBeGreaterThan(parentPhase(i - 1).progress);
  });
});

describe("FAQ", () => {
  it("has one tab per audience and no duplicate questions within a tab", () => {
    expect(FAQ_GROUPS.map((g) => g.id)).toEqual(["parents", "students", "tutors"]);
    for (const g of FAQ_GROUPS) expect(new Set(g.items.map((i) => i.q)).size).toBe(g.items.length);
  });
  it("answers the questions families were looking for", () => {
    const qs = ALL_FAQ.map((i) => i.q.toLowerCase()).join("\n");
    for (const topic of ["google account", "switch tutors", "doesn’t show up", "how long", "try one lesson", "who can sign up", "need for a lesson"]) {
      expect(qs).toContain(topic);
    }
  });
  it("keeps jargon out of the answers students read", () => {
    const students = FAQ_GROUPS.find((g) => g.id === "students")!;
    for (const i of students.items) {
      expect(i.a).not.toMatch(/database|seniority|consent form|guardian approval/i);
      expect(i.a.length).toBeLessThan(320);
    }
  });
});
