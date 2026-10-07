import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ALL_FAQ, FAQ_GROUPS } from "@/content/faq";
import { FaqTabs } from "@/components/site/faq-tabs";
import { ClosingCta, PageHero } from "@/components/site/page-hero";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";

const DESCRIPTION = "Answers for parents, middle schoolers and high school tutors: cost, eligibility, what a lesson needs, switching tutors, missed lessons and volunteer hours.";
export const metadata: Metadata = pageSeo("/faq", "Questions & answers", DESCRIPTION, { ownImage: true });

const LINK = "font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink";

/** The one place every FAQ lives. Other pages link here (to #parents, #students or #tutors) instead of repeating it. */
export default function FaqPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({ path: "/faq", name: "Questions & answers", description: DESCRIPTION, type: "FAQPage" }),
          faqJsonLd(ALL_FAQ),
          breadcrumbJsonLd([{ name: "Questions & answers", path: "/faq" }]),
        ]}
      />
      <PageHero
        eyebrow="Questions"
        title={
          <>
            Straight answers, <em>sorted by who’s asking.</em>
          </>
        }
        lead="Pick your tab. Parents get the details, students get the short version, and tutors get what volunteering involves."
      />
      <section className="lm-wrap py-[clamp(48px,7vw,96px)]">
        <FaqTabs groups={FAQ_GROUPS} />
        <p className="mx-auto mt-12 max-w-xl text-center text-[15px] leading-relaxed text-muted">
          Didn’t find it? <Link href="/contact" className={LINK}>Ask the program team</Link>, no account needed. Getting ready for a first lesson?{" "}
          <Link href="/how-it-works#first-lesson" className={LINK}>Here’s the checklist</Link>.
        </p>
      </section>
      <ClosingCta
        eyebrow="Ready when you are"
        title={
          <>
            A parent says yes, <em>then the music starts.</em>
          </>
        }
        lead="Create the account, add your student, and sign consent. It takes about five minutes."
        micro="Free · Online · Never recorded"
      >
        <Link href="/signup?role=family" className="lm-btn lm-btn-ink">
          I’m a parent — get started <ArrowRight className="size-4" />
        </Link>
        <Link href="/signup?role=student" className="lm-btn lm-btn-glass">
          I’m a student
        </Link>
        <Link href="/signup?role=tutor" className="lm-btn lm-btn-glass">
          I want to tutor
        </Link>
      </ClosingCta>
    </>
  );
}
