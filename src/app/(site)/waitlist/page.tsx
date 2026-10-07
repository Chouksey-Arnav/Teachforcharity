import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { WaitlistForm, type WaitlistReason } from "@/components/site/waitlist-form";
import { createClient } from "@/lib/supabase/server";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";

const DESCRIPTION = "No tutor for your instrument yet, not in North Carolina, or not in 6th grade yet? Leave an email and we’ll send one note when that changes.";
export const metadata: Metadata = pageSeo("/waitlist", "Join the waitlist", DESCRIPTION, { ownImage: true });

const LINK = "font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink";

/** Where "not eligible yet" and "no tutor yet" land, from the home page, sign-up and onboarding. */
export default async function WaitlistPage({ searchParams }: PageProps<"/waitlist">) {
  const sp = await searchParams;
  const reason: WaitlistReason = sp.reason === "region" || sp.reason === "grade" ? sp.reason : "instrument";
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("slug, name").eq("is_active", true).eq("is_custom", false).order("name");
  const instruments = subjects ?? [];
  const instrument = typeof sp.instrument === "string" && instruments.some((i) => i.slug === sp.instrument) ? sp.instrument : "";
  return (
    <>
      <JsonLd data={[webPageJsonLd({ path: "/waitlist", name: "Join the waitlist", description: DESCRIPTION }), breadcrumbJsonLd([{ name: "Join the waitlist", path: "/waitlist" }])]} />
      <PageHero
        sky="gold"
        eyebrow="Waitlist"
        title={
          <>
            Not a fit yet? <em>We’ll email you.</em>
          </>
        }
        lead="Lessons are for middle schoolers in grades 6–8 in North Carolina, matched with a tutor who plays their instrument. If one of those isn’t true yet, leave an email. We send one note when it changes."
      />
      <section className="mx-auto w-[min(820px,100%-2*clamp(16px,3vw,40px))] py-[clamp(48px,7vw,96px)]">
        <div className="rv rounded-[28px] border border-ink/10 bg-white p-[clamp(20px,3.5vw,36px)] shadow-card">
          <WaitlistForm instruments={instruments} defaultReason={reason} key={`${reason}:${instrument}`} {...(instrument ? { defaultInstrument: instrument } : {})} />
        </div>
        <p className="mt-8 text-center text-[14.5px] leading-relaxed text-muted">
          In 9th grade or above and play an instrument? <Link href="/volunteer" className={LINK}>You could tutor</Link>. Questions?{" "}
          <Link href="/contact" className={LINK}>Ask us</Link>.
        </p>
      </section>
    </>
  );
}
