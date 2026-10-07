import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { causeReady } from "@/lib/cause";
import { CauseCard } from "@/components/site/sections";
import { PageHero } from "@/components/site/page-hero";
import { getPublicConfig } from "@/lib/viewer";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";

const DESCRIPTION = "How families can optionally give back to our nonprofit partner's current cause. Lessons are always free; giving is never required.";
export const metadata: Metadata = pageSeo("/cause", "The cause", DESCRIPTION);

export default async function CausePage() {
  const config = await getPublicConfig();
  // No placeholder trust page: until a confirmed partner has a real cause and a donation page, this page doesn't exist.
  if (!causeReady(config)) notFound();
  return (
    <>
      <JsonLd data={[webPageJsonLd({ path: "/cause", name: "The cause", description: DESCRIPTION }), breadcrumbJsonLd([{ name: "The cause", path: "/cause" }])]} />
      <PageHero
        sky="gold"
        eyebrow="The cause"
        title={
          <>
            Free lessons, and a simple way to <em>pay it forward.</em>
          </>
        }
        lead="Every lesson is free. If your family wants to give back, you can support our nonprofit partner’s current community cause — directly, on their own website."
      />
      <section className="lm-wrap py-[clamp(56px,7vw,96px)]">
        <div className="rv">
          <CauseCard config={config} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["We never touch money", "No payments, donations, or fees ever pass through this site, its organizers, or any student — in any direction."],
            ["Never a condition", "Donating has nothing to do with getting a tutor, the quality of lessons, or anything else in the program."],
            ["The cause can change", "Our partner chooses its current cause. When it changes, we update this page."],
          ].map(([t, d], i) => (
            <div key={t} className={`rv rv-d${i + 1} rounded-[22px] border border-ink/10 bg-white p-6 shadow-card`}>
              <span className="font-mono text-[11px] tracking-[0.14em] text-pine-700">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="mt-3 text-[16.5px] font-semibold tracking-[-0.01em]">{t}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
