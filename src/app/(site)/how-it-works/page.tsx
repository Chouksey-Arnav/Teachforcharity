import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FAQ_ITEMS, HoursTimeline, Steps } from "@/components/site/sections";
import { FaqList } from "@/components/landing/sections";
import { ClosingCta, PageHero, SectionHead } from "@/components/site/page-hero";

export const metadata: Metadata = { title: "How it works", description: "How students and tutors are matched, how lessons are scheduled, and how volunteer hours are verified." };

const MATCH_FACTORS = [
  ["Instrument", "Always first. Tutors only see requests for instruments they actually play. If no one plays yours yet, we show clearly-labelled tutors on a closely related instrument."],
  ["Level", "Tutors choose which levels they want to teach. A beginner is matched with someone who wants beginners — we never rank tutors by how long they’ve played."],
  ["Schedule", "You each mark the times you’re usually free. Tutors who share more of your times rank higher."],
  ["Goals", "Audition prep, reading music, jazz, fundamentals — we look for tutors whose strengths line up with what your student wants."],
  ["Learning style", "Some students like a clear plan and demonstrations; others like to understand the why. We match that too."],
  ["Interests", "Film scores, jazz, marching band, pop covers — sharing what you love to play is a small tiebreaker that makes lessons more fun."],
  ["Fair load", "Tutors with open spots rank higher among equally good matches, so no one gets overloaded and new tutors get students."],
];

const SCHEDULING: [string, string][] = [
  ["The student (or parent) requests a time —", "any quarter hour between 8 AM and 10 PM Eastern, at least two hours ahead."],
  ["The tutor accepts, declines, or suggests another time.", "You can go back and forth until a time works. Every step sends an email that says exactly what to do next."],
  [
    "Once booked,",
    "both sides get a calendar invite and a reminder the day before. The Join button (for the tutor’s Google Meet) appears on the Lessons page 15 minutes before the start.",
  ],
  ["Double-booking is impossible —", "the system won’t let a tutor or student be in two lessons at once."],
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title={
          <>
            Simple for students. <em>Careful</em> behind the scenes.
          </>
        }
        lead="Here’s everything that happens between signing up and a tutor’s hours being verified — including the parts you’ll never have to think about."
      />

      <section className="lm-wrap py-[clamp(64px,8vw,112px)]">
        <SectionHead eyebrow="Four steps" title={<>From sign-up to <em>first lesson.</em></>} className="mb-12" />
        <div className="rv">
          <Steps tone="card" />
        </div>
      </section>

      <section className="px-[clamp(8px,1.6vw,24px)]">
        <div className="lm-sky lm-sky-dusk lm-panel">
          <div className="lm-wrap grid gap-12 py-[clamp(56px,7vw,96px)] lg:grid-cols-[1fr_1.4fr]">
            <div className="rv">
              <p className="lm-eyebrow">The matching</p>
              <h2 className="lm-h2 mt-[18px] text-ink">
                Compatibility, <em>not seniority.</em>
              </h2>
              <p className="lm-sub mt-5">
                Every student sees a ranked list of tutors with the reasons behind each match — and anything that’s less than ideal, like no overlapping
                times, is called out plainly. Tutors see the same scores from their side, with their best-fit students at the top, and can offer to teach.
              </p>
            </div>
            <dl className="lm-frost rv rv-d1 grid gap-x-8 gap-y-6 rounded-[26px] p-6 sm:grid-cols-2 sm:p-8">
              {MATCH_FACTORS.map(([t, d], i) => (
                <div key={t} className={i ? "border-t border-ink/10 pt-5 sm:[&:nth-child(2)]:border-0 sm:[&:nth-child(2)]:pt-0" : ""}>
                  <dt className="flex items-center gap-2.5 font-semibold text-ink">
                    <span className="font-mono text-[11px] text-pine-700">{String(i + 1).padStart(2, "0")}</span>
                    {t}
                  </dt>
                  <dd className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="lm-wrap py-[clamp(64px,8vw,112px)]">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="rv">
            <p className="lm-eyebrow">Scheduling</p>
            <h2 className="lm-h2 mt-[18px] text-ink">
              Request, confirm, <em>done.</em>
            </h2>
            <ul className="mt-8 space-y-3">
              {SCHEDULING.map(([t, d]) => (
                <li key={t} className="rounded-[22px] border border-ink/10 bg-white p-5 text-[15px] leading-relaxed text-ink-2 shadow-card">
                  <strong className="text-ink">{t}</strong> {d}
                </li>
              ))}
            </ul>
          </div>
          <div className="rv rv-d1">
            <p className="lm-eyebrow">Hour verification</p>
            <h2 className="lm-h2 mt-[18px] text-ink">
              Three people agree <em>before an hour counts.</em>
            </h2>
            <div className="mt-8 rounded-[26px] border border-ink/10 bg-white p-6 shadow-lift sm:p-8">
              <HoursTimeline />
            </div>
          </div>
        </div>
      </section>

      <section className="lm-wrap pb-[clamp(64px,8vw,112px)]">
        <SectionHead eyebrow="Questions" title={<>What people <em>ask</em> us.</>} />
        <FaqList items={FAQ_ITEMS} />
      </section>

      <ClosingCta
        eyebrow="Ready when you are"
        title={
          <>
            Sign-up takes <em>a few minutes.</em>
          </>
        }
        lead="A short questionnaire, a parent’s yes, and a tutor who plays your instrument."
        micro="Free · Online · Parent-approved"
      >
        <Link href="/signup" className="lm-btn lm-btn-ink">
          Get started <ArrowRight className="size-4" />
        </Link>
        <Link href="/safety" className="lm-btn lm-btn-glass">
          Read the safety policy
        </Link>
      </ClosingCta>
    </>
  );
}
