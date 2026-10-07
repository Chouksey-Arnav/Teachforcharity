import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { HoursTimeline } from "@/components/site/sections";
import { PageHero, SectionHead } from "@/components/site/page-hero";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";

const DESCRIPTION = "High school musicians: teach middle schoolers band and orchestra for free, on your own schedule, and earn volunteer hours verified by a partner nonprofit.";
export const metadata: Metadata = pageSeo("/volunteer", "Become a tutor", DESCRIPTION, { ownImage: true });

const NEED = [
  "You’re in 9th–12th grade and play a band or orchestra instrument.",
  "You can make a free Google Meet link (a personal Google account works).",
  "A parent or guardian who approves — we’ll email them a link to say yes.",
  "An hour or two a week, on your own schedule. Once your parent approves and the program team takes a quick look, families can find you."
];

const PERKS: [string, string][] = [
  ["You choose who you teach", "Pick the instruments you play and the levels you want to teach — beginners, advanced players, or both. You set how many students you take (1–8) and when you’re free."],
  ["You stay in control of your time", "Students send requests — or you can browse students who fit you and offer to teach. Accept, decline, or suggest a different time, and cancel from your dashboard if something comes up."],
  ["Your hours are verified", "Log each lesson after it happens. Once the student’s side confirms it, our nonprofit partner verifies your hours weekly, and you can print your record anytime."],
];

const RULES = [
  "Lessons are only on your Google Meet link — never in person.",
  "Never record a lesson or screenshot a student.",
  "Keep every message on the platform. No numbers, socials, or other apps.",
  "Never accept money or gifts.",
  "Log lessons honestly. Unconfirmed lessons don’t count.",
  "Report anything that feels off, right away.",
];

export default function VolunteerPage() {
  return (
    <>
      <JsonLd data={[webPageJsonLd({ path: "/volunteer", name: "Become a tutor", description: DESCRIPTION }), breadcrumbJsonLd([{ name: "Become a tutor", path: "/volunteer" }])]} />
      <PageHero
        eyebrow="For high school musicians"
        title={
          <>
            Teach what you love. Get hours that <em>hold up.</em>
          </>
        }
        lead="Help a middle schooler through the stuff that was hard for you — and build a real teaching record while you do it."
      >
        <div className="mt-9 flex flex-col items-center gap-4">
          <Link href="/signup?role=tutor" className="lm-btn lm-btn-ink">
            Sign up to tutor <ArrowRight className="size-4" />
          </Link>
          <p className="lm-micro">About five minutes · Works on your phone</p>
        </div>
        <div className="lm-frost mx-auto mt-10 w-full max-w-[600px] rounded-[22px] p-6 text-left sm:p-7">
          <h2 className="lm-micro text-pine-700">What you need</h2>
          <ul className="mt-4 space-y-3">
            {NEED.map((n) => (
              <li key={n} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
                <Check className="mt-1 size-4 shrink-0 text-pine-700" /> {n}
              </li>
            ))}
          </ul>
        </div>
      </PageHero>

      <section className="lm-wrap py-[clamp(64px,8vw,112px)]">
        <SectionHead eyebrow="Why tutors join" title={<>Your instrument. Your schedule. <em>Your record.</em></>} className="mb-12" />
        <div className="grid gap-4 md:grid-cols-3">
          {PERKS.map(([t, d], i) => (
            <div key={t} className={`rv rv-d${i + 1} rounded-[22px] border border-ink/10 bg-white p-7 shadow-card`}>
              <span className={`flex size-11 items-center justify-center rounded-[13px] font-mono text-[13px] ${["bg-mint", "bg-peach", "bg-lilac"][i]}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="lm-h3 mt-5 !text-[24px]">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lm-wrap pb-[clamp(64px,8vw,112px)]">
        <SectionHead eyebrow="Hour verification" title={<>How your hours get <em>verified.</em></>} className="mb-10" />
        <div className="rv rounded-[26px] border border-ink/10 bg-white p-7 shadow-lift sm:p-10">
          <HoursTimeline />
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-relaxed text-muted">
          Whether verified hours count toward NHS, Tri-M, or a school requirement is up to that organization — check with your advisor before you count on
          them.
        </p>
      </section>

      <section className="px-[clamp(8px,1.6vw,24px)] pb-[clamp(16px,2vw,28px)]">
        <div className="lm-panel relative overflow-hidden bg-ink px-[clamp(20px,5vw,72px)] py-[clamp(56px,7vw,96px)] text-cream">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ background: "var(--lm-grain)" }} />
          <div className="relative mx-auto max-w-[920px] text-center">
            <p className="lm-eyebrow !text-glow">The rules, up front</p>
            <h2 className="lm-h2 mt-[18px]">
              Six promises. <em>No exceptions.</em>
            </h2>
            <ul className="mt-10 grid gap-3 text-left text-[15px] leading-relaxed text-cream/85 sm:grid-cols-2">
              {RULES.map((r) => (
                <li key={r} className="rv flex gap-3 rounded-[18px] bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10">
                  <Check className="mt-1 size-4 shrink-0 text-glow" /> {r}
                </li>
              ))}
            </ul>
            <Link href="/signup?role=tutor" className="lm-btn lm-btn-glow mt-10">
              I’m in — sign me up <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
