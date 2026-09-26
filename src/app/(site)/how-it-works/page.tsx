import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Faq, FAQ_ITEMS, HoursTimeline, Steps } from "@/components/site/sections";

export const metadata: Metadata = { title: "How it works", description: "How families and tutors are matched, how lessons are scheduled, and how volunteer hours are verified." };

const MATCH_FACTORS = [
  ["Instrument", "Always first. Tutors only see requests for instruments they actually play. If no one plays yours yet, we show clearly-labelled tutors on a closely related instrument."],
  ["Level", "Tutors choose which levels they want to teach. A beginner is matched with someone who wants beginners — we never rank tutors by how long they’ve played."],
  ["Schedule", "You each mark the times you’re usually free. Tutors who share more of your times rank higher."],
  ["Goals", "Audition prep, reading music, jazz, fundamentals — we look for tutors whose strengths line up with what your student wants."],
  ["Learning style", "Some students like a clear plan and demonstrations; others like to understand the why. We match that too."],
  ["Fair load", "Tutors with open spots rank higher among equally good matches, so no one gets overloaded and new tutors get students."],
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6">
        <p className="eyebrow">How it works</p>
        <h1 className="display mt-4 max-w-4xl text-5xl sm:text-7xl">Simple for families. Careful behind the scenes.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Here’s everything that happens between signing up and a tutor’s hours being verified — including the parts you’ll never have to
          think about.
        </p>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Steps tone="card" />
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow">The matching</p>
            <h2 className="display mt-3 text-4xl sm:text-5xl">Compatibility, not seniority.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              Every student sees a ranked list of tutors with the reasons behind each match — and anything that’s less than ideal, like
              no overlapping times, is called out plainly.
            </p>
          </div>
          <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {MATCH_FACTORS.map(([t, d]) => (
              <div key={t} className="border-t border-line pt-4">
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Scheduling</p>
            <h2 className="display mt-3 text-4xl">Request, confirm, done.</h2>
            <ul className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-2">
              <li>
                <strong>Families request a time</strong> — any quarter hour between 8 AM and 10 PM Eastern, at least two hours ahead.
              </li>
              <li>
                <strong>The tutor accepts, declines, or suggests another time.</strong> You can go back and forth until a time works.
                Every step sends an email that says exactly what to do next.
              </li>
              <li>
                <strong>Once booked,</strong> both sides get the Google Meet link and a calendar invite, plus a reminder the day before.
              </li>
              <li>
                <strong>Double-booking is impossible</strong> — the system won’t let a tutor or student be in two lessons at once.
              </li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Hour verification</p>
            <h2 className="display mt-3 text-4xl">Three people agree before an hour counts.</h2>
            <div className="mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8">
              <HoursTimeline />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <h2 className="display mb-8 text-4xl">Common questions</h2>
        <Faq items={FAQ_ITEMS} />
        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/signup?role=family" size="lg">
            Get started <ArrowRight className="size-4" />
          </LinkButton>
          <LinkButton href="/safety" variant="secondary" size="lg">
            Read the safety policy
          </LinkButton>
        </div>
      </section>
    </>
  );
}
