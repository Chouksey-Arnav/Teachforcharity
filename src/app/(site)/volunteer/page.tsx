import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { HoursTimeline } from "@/components/site/sections";

export const metadata: Metadata = { title: "Become a tutor", description: "High school musicians: teach middle schoolers for free and earn verified volunteer hours." };

const NEED = [
  "You’re in 9th–12th grade and play a band or orchestra instrument.",
  "You can make a free Google Meet link (a personal Google account works).",
  "A parent or guardian who approves — we’ll email them a link to say yes.",
  "An hour or two a week, on your own schedule. Once your parent approves and the program team takes a quick look, families can find you."
];

export default function VolunteerPage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <p className="eyebrow">For high school musicians</p>
          <h1 className="display mt-4 text-5xl sm:text-7xl">Teach what you love. Get hours that hold up.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Help a middle schooler through the stuff that was hard for you — and build a real teaching record while you do it.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/signup?role=tutor" size="lg">
              Sign up to tutor <ArrowRight className="size-4" />
            </LinkButton>
          </div>
          <p className="mt-4 text-sm text-muted">Sign-up takes about five minutes. You can do it on your phone.</p>
        </div>
        <div className="rounded-3xl border border-line bg-card p-7">
          <h2 className="font-semibold">What you need</h2>
          <ul className="mt-4 space-y-3">
            {NEED.map((n) => (
              <li key={n} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
                <Check className="mt-1 size-4 shrink-0 text-pine-600" /> {n}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-3">
          {[
            ["You choose who you teach", "Pick the instruments you play and the levels you want to teach — beginners, advanced players, or both. You set how many students you take (1–8) and when you’re free."],
            ["You stay in control of your time", "Students send requests — or you can browse students who fit you and offer to teach. Accept, decline, or suggest a different time, and cancel from your dashboard if something comes up."],
            ["Your hours are verified", "Log each lesson after it happens. Once the student’s side confirms it, our nonprofit partner verifies your hours weekly, and you can print your record anytime."],
          ].map(([t, d]) => (
            <div key={t}>
              <h2 className="display text-3xl">{t}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="display text-4xl">How your hours get verified</h2>
        <div className="mt-8 rounded-3xl border border-line bg-card p-7 sm:p-10">
          <HoursTimeline />
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
          Whether verified hours count toward NHS, Tri-M, or a school requirement is up to that organization — check with your advisor
          before you count on them.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="rounded-3xl bg-pine-900 p-8 text-white sm:p-12">
          <h2 className="display text-4xl">The rules, up front</h2>
          <ul className="mt-6 grid gap-3 text-[15px] leading-relaxed text-white/80 sm:grid-cols-2">
            {[
              "Lessons are only on your Google Meet link — never in person.",
              "Never record a lesson or screenshot a student.",
              "Keep every message on the platform. No numbers, socials, or other apps.",
              "Never accept money or gifts.",
              "Log lessons honestly. Unconfirmed lessons don’t count.",
              "Report anything that feels off, right away.",
            ].map((r) => (
              <li key={r} className="flex gap-3">
                <Check className="mt-1 size-4 shrink-0 text-brass-300" /> {r}
              </li>
            ))}
          </ul>
          <LinkButton href="/signup?role=tutor" variant="brass" size="lg" className="mt-9">
            I’m in — sign me up
          </LinkButton>
        </div>
      </section>
    </>
  );
}
