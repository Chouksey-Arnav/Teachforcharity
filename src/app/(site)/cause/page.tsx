import type { Metadata } from "next";
import { CauseCard } from "@/components/site/sections";
import { getPublicConfig } from "@/lib/viewer";

export const metadata: Metadata = { title: "The cause", description: "How families can optionally give back to our nonprofit partner's current cause." };

export default async function CausePage() {
  const config = await getPublicConfig();
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 sm:px-6">
        <p className="eyebrow">The cause</p>
        <h1 className="display mt-4 max-w-4xl text-5xl sm:text-7xl">Free lessons, and a simple way to pay it forward.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Every lesson is free. If your family wants to give back, you can support our nonprofit partner’s current community cause —
          directly, on their own website.
        </p>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <CauseCard config={config} />
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            ["We never touch money", "No payments, donations, or fees ever pass through this site, its organizers, or any student — in any direction."],
            ["Never a condition", "Donating has nothing to do with getting a tutor, the quality of lessons, or anything else in the program."],
            ["The cause can change", "Our partner chooses its current cause. When it changes, we update this page."],
          ].map(([t, d]) => (
            <div key={t} className="border-t border-line pt-5">
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
