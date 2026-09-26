import { ArrowRight, Music2 } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { CauseCard, ExampleMatch, Faq, FAQ_ITEMS, HoursTimeline, SafetyGrid, Steps, WhoItsFor } from "@/components/site/sections";
import { getPublicConfig } from "@/lib/viewer";

export default async function HomePage() {
  const config = await getPublicConfig();
  const stats = config?.stats;
  const showStats = Boolean(stats && stats.active_tutors >= 5);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grain opacity-60" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.15fr_1fr] lg:pb-28">
          <div className="animate-rise">
            <p className="eyebrow">Free · Online · Across North Carolina</p>
            <h1 className="display mt-5 text-[3.1rem] text-ink sm:text-7xl">
              Music lessons from someone who was <em className="text-pine-700">just in your seat.</em>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted sm:text-lg">
              High school band and orchestra players teach middle schoolers one-on-one over Google Meet. Lessons are free, every match
              starts with the instrument and the student’s level, and parents stay in the loop from the first message to the last lesson.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/signup?role=family" size="lg">
                Find a tutor for my student <ArrowRight className="size-4" />
              </LinkButton>
              <LinkButton href="/signup?role=tutor" variant="secondary" size="lg">
                <Music2 className="size-4" /> Volunteer as a tutor
              </LinkButton>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-ink-2">
              {["No cost, ever", "Lessons are never recorded", "Parent consent before any lesson"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-brass-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <ExampleMatch />
          </div>
        </div>
      </section>

      {showStats && stats && (
        <section className="border-y border-line bg-card">
          <dl className="mx-auto grid max-w-6xl grid-cols-3 divide-x divide-line px-4 sm:px-6">
            {[
              [stats.active_tutors, "volunteer tutors"],
              [stats.instruments, "instruments taught"],
              [stats.verified_hours, "verified volunteer hours"],
            ].map(([n, l]) => (
              <div key={String(l)} className="px-3 py-7 text-center">
                <dt className="sr-only">{l}</dt>
                <dd className="display text-4xl text-pine-800 sm:text-5xl">{n}</dd>
                <p className="mt-1 text-xs text-muted sm:text-sm">{l}</p>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Who it's for */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow">Three groups, one program</p>
          <h2 className="display mt-3 text-4xl sm:text-5xl">Everybody in the room gets something real.</h2>
        </div>
        <WhoItsFor />
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow">How it works</p>
            <h2 className="display mt-3 text-4xl sm:text-5xl">From sign-up to first lesson in a few days.</h2>
          </div>
          <LinkButton href="/how-it-works" variant="ghost">
            The details <ArrowRight className="size-4" />
          </LinkButton>
        </div>
        <Steps />
      </section>

      {/* Safety */}
      <section className="relative overflow-hidden bg-pine-900 text-white">
        <div className="absolute inset-0 opacity-[0.07] staff-bg invert" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="eyebrow text-brass-300!">Safety & transparency</p>
              <h2 className="display mt-3 text-4xl sm:text-5xl">Safety isn’t a checkbox here. It’s the design.</h2>
              <p className="mt-5 text-[16px] leading-relaxed text-white/70">
                Everyone in a lesson is a minor, so every rule below is enforced by the site itself — not just written in a policy.
              </p>
              <LinkButton href="/safety" variant="light" className="mt-8">
                Read the full safety policy <ArrowRight className="size-4" />
              </LinkButton>
            </div>
            <SafetyGrid />
          </div>
        </div>
      </section>

      {/* Hours */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:items-start">
          <div>
            <p className="eyebrow">For tutors</p>
            <h2 className="display mt-3 text-4xl sm:text-5xl">Volunteer hours that actually mean something.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              A lesson only counts after three different people agree it happened. That’s what makes the hours on your record credible —
              they’re verified by our nonprofit partner, not just by us.
            </p>
            <LinkButton href="/volunteer" variant="secondary" className="mt-8">
              Becoming a tutor <ArrowRight className="size-4" />
            </LinkButton>
          </div>
          <div className="rounded-3xl border border-line bg-card p-7 sm:p-10">
            <HoursTimeline />
            <p className="mt-8 border-t border-line pt-5 text-[13px] leading-relaxed text-muted">
              Whether verified hours count toward NHS, Tri-M, or a school requirement is decided by each school or organization — check
              with your advisor.
            </p>
          </div>
        </div>
      </section>

      {/* Cause */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="mb-10 max-w-2xl">
          <p className="eyebrow">Giving back</p>
          <h2 className="display mt-3 text-4xl sm:text-5xl">Lessons are free. Giving back is optional.</h2>
        </div>
        <CauseCard config={config} />
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <h2 className="display mb-8 text-4xl sm:text-5xl">Questions parents ask</h2>
        <Faq items={FAQ_ITEMS} />
      </section>

      {/* Closing CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-brass-100 px-6 py-14 text-center sm:px-12 sm:py-20">
          <div className="absolute inset-0 staff-bg opacity-60" aria-hidden />
          <div className="relative">
            <h2 className="display mx-auto max-w-3xl text-4xl sm:text-6xl">Ready when you are.</h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">
              Sign up takes a few minutes. Families get matched with a tutor; tutors get a real way to give back with the thing they’re
              best at.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <LinkButton href="/signup?role=family" size="lg">
                I’m a parent or guardian
              </LinkButton>
              <LinkButton href="/signup?role=tutor" variant="secondary" size="lg">
                I’m a high school musician
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
