import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 };

/** A headline as parts; the `em` part is the italic accent word, as on the site. */
export type OgTitle = { text: string; em?: boolean }[];

const font = (file: string) => readFile(join(process.cwd(), "assets/og", file));

/**
 * The share card for one page: cream paper under the painted sky, the page's eyebrow in Geist Mono, its headline in
 * Source Serif 4 with one italic accent, and the three promises as pills. Colours are the theme tokens from
 * globals.css (paper, ink, forest, glow, mint, peach, lilac); the image renderer can't read CSS variables.
 */
export async function renderOgImage({ eyebrow, title, size = 84 }: { eyebrow: string; title: OgTitle; size?: number }) {
  const [serif, serifItalic, sans, mono] = await Promise.all([
    font("SourceSerif4-SemiBold.ttf"),
    font("SourceSerif4-Italic.ttf"),
    font("Inter-Medium.ttf"),
    font("GeistMono-Medium.ttf"),
  ]);
  const host = SITE.url.replace(/^https?:\/\//, "");
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          color: "#16201c",
          backgroundColor: "#f8f6ee",
          backgroundImage: [
            "radial-gradient(circle at 12% 8%, #dcd6f2 0%, rgba(220,214,242,0) 42%)",
            "radial-gradient(circle at 92% 6%, #f7dcb6 0%, rgba(247,220,182,0) 40%)",
            "radial-gradient(circle at 6% 100%, #f1d77f 0%, rgba(241,215,127,0) 38%)",
            "radial-gradient(circle at 96% 96%, #b8dcc8 0%, rgba(184,220,200,0) 42%)",
          ].join(", "),
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: "#f4d36f", border: "3px solid #16201c" }} />
            <div style={{ display: "flex", fontFamily: "Source Serif", fontSize: 34, letterSpacing: -0.5 }}>
              Teach&nbsp;<span style={{ fontFamily: "Source Serif Italic" }}>for a</span>&nbsp;Cause
            </div>
          </div>
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 20, color: "#4b5550" }}>{host}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Geist Mono", fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#1f5446" }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: "#1f5446", opacity: 0.55 }} />
            {eyebrow}
            <div style={{ width: 8, height: 8, borderRadius: 999, background: "#1f5446", opacity: 0.55 }} />
          </div>
          {/* One flex item per word, so the italic accent wraps inline with the rest of the line. */}
          <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Source Serif", fontSize: size, lineHeight: 1.04, letterSpacing: -2, maxWidth: 1050 }}>
            {title.flatMap((p, i) =>
              p.text
                .split(/\s+/)
                .filter(Boolean)
                .map((w, j) => (
                  <span key={`${i}-${j}`} style={{ marginRight: size * 0.24, ...(p.em ? { fontFamily: "Source Serif Italic" } : {}) }}>
                    {w}
                  </span>
                )),
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              ["Free, always", "#bfe3c9"],
              ["Parent consent first", "#d9d3f1"],
              [`${SITE.region} middle schoolers`, "#f8cfa3"],
            ].map(([t, bg]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderRadius: 999, background: "#ffffff", border: "1px solid rgba(22,32,28,0.12)", fontSize: 20 }}>
                <div style={{ width: 12, height: 12, borderRadius: 999, background: bg }} />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Source Serif", data: serif, style: "normal", weight: 600 },
        { name: "Source Serif Italic", data: serifItalic, style: "normal", weight: 500 },
        { name: "Inter", data: sans, style: "normal", weight: 500 },
        { name: "Geist Mono", data: mono, style: "normal", weight: 500 },
      ],
    },
  );
}

/** The share image every page gets: one place, so the title and the picture never drift apart. */
export const OG_PAGES = {
  home: { eyebrow: "Free music lessons", title: [{ text: "Free music lessons from someone who was " }, { text: "just in your seat.", em: true }] },
  how: { eyebrow: "How it works", title: [{ text: "From one questionnaire to a " }, { text: "free lesson.", em: true }] },
  safety: { eyebrow: "Safety & consent", title: [{ text: "Built for a program where everyone in the lesson is " }, { text: "a minor.", em: true }], size: 76 },
  volunteer: { eyebrow: "For high school musicians", title: [{ text: "Teach what you love. Get hours that " }, { text: "hold up.", em: true }] },
  faq: { eyebrow: "Questions", title: [{ text: "Straight answers for parents, students and " }, { text: "tutors.", em: true }], size: 78 },
  about: { eyebrow: "About us", title: [{ text: "Who runs Teach for a Cause, and " }, { text: "why.", em: true }] },
  contact: { eyebrow: "Contact", title: [{ text: "Questions or a concern? " }, { text: "Reach a person.", em: true }] },
  waitlist: { eyebrow: "Waitlist", title: [{ text: "No tutor for your instrument yet? " }, { text: "We’ll email you.", em: true }], size: 78 },
  signup: { eyebrow: "Get started", title: [{ text: "Free lessons start with a " }, { text: "parent’s yes.", em: true }] },
} satisfies Record<string, { eyebrow: string; title: OgTitle; size?: number }>;

export const ogAlt = (key: keyof typeof OG_PAGES) => `${SITE.name}: ${OG_PAGES[key].title.map((p) => p.text).join("")}`;
