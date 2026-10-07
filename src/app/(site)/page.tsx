import Link from "next/link";
import { ArrowRight, GraduationCap, Music2, Users } from "lucide-react";
import { FAQ_ITEMS } from "@/components/site/sections";
import { getPublicConfig, getViewer } from "@/lib/viewer";
import { cn } from "@/lib/cn";
import { HeroDemo } from "@/components/landing/hero-demo";
import { HeroDoors } from "@/components/landing/hero-doors";
import { WelcomeHero } from "@/components/landing/welcome-hero";
import { RoleSwitcher } from "@/components/landing/role-switcher";
import { SafetyDemo } from "@/components/landing/safety-demo";
import { StatTiles, type StatTile } from "@/components/landing/stat-tiles";
import { Cause, FaqList, HoursChain, HowSteps, InstrumentMarquee, SafetyPoints } from "@/components/landing/sections";
import s from "@/components/landing/landing.module.css";

export default async function HomePage() {
  const [config, viewer] = await Promise.all([getPublicConfig(), getViewer()]);
  const stats = config?.stats;
  // Real numbers only once there are enough to mean something; until then, the rules the system enforces.
  const tiles: StatTile[] =
    stats && stats.active_tutors >= 5
      ? [
          { value: stats.active_tutors, label: "volunteer tutors", src: "high school musicians" },
          { value: stats.instruments, label: "instruments taught", src: "band & orchestra" },
          { value: stats.verified_hours, label: "verified volunteer hours", src: "checked by our partner" },
        ]
      : [
          { value: 0, prefix: "$", label: "cost to families, ever", src: "no payment info anywhere" },
          { value: 3, label: "people confirm every hour", src: "tutor · family · nonprofit" },
          { value: 100, suffix: "%", label: "of messages a parent can read", src: "from their own dashboard" },
        ];

  return (
    <>
      {/* Hero: what this is, who it's for, and a way in for each of them — or, signed in, the way back to your account. */}
      {viewer ? (
        <WelcomeHero viewer={viewer} />
      ) : (
        <section className={s.hero}>
          <div className={cn("lm-sky", s.heroPanel)}>
            <svg className={s.staff} viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden>
              {[60, 80, 100, 120, 140].map((y) => (
                <path key={y} d={`M0 ${y} C 260 ${y - 34}, 520 ${y + 30}, 760 ${y} S 1080 ${y - 26}, 1200 ${y + 6}`} fill="none" stroke="currentColor" strokeWidth="1" />
              ))}
            </svg>
            <div className={s.heroGrid}>
              <div className={s.heroContent}>
                <p className="lm-eyebrow animate-rise">
                  Volunteer-run<span className="max-[400px]:hidden"> · Online</span> · North Carolina
                </p>
                <h1 className={cn("lm-h1 animate-rise text-ink [animation-delay:60ms]", s.heroTitle)}>
                  Free music lessons from someone who was <em>just in your seat.</em>
                </h1>
                <p className={cn("lm-sub animate-rise [animation-delay:120ms]", s.lead)}>
                  High school band and orchestra players teach middle schoolers one-on-one over Google Meet — matched by instrument and level, with a
                  parent’s OK before anything happens.
                </p>
                <HeroDoors />
                <p className={cn(s.heroSignIn, "animate-rise [animation-delay:480ms]")}>
                  Already have an account?{" "}
                  <Link href="/login">
                    Sign in <ArrowRight className="inline size-3.5 -translate-y-px" />
                  </Link>
                </p>
                <p className={cn("lm-micro animate-rise [animation-delay:540ms]", s.heroMicro)}>Free, always · Never recorded · Parent consent first</p>
              </div>
              <HeroDemo />
            </div>
            <div className={s.dome} aria-hidden />
          </div>
        </section>
      )}

      <InstrumentMarquee open={config?.stats?.open_by_instrument ?? []} />

      {/* How it works */}
      <section id="how" className={cn(s.sec, "scroll-mt-20")}>
        <div className="lm-wrap">
          <div className={s.head}>
            <p className="lm-eyebrow rv">How it works</p>
            <h2 className="lm-h2 rv rv-d1">
              Tell us what you play. <em>Meet</em> who can teach it.
            </h2>
            <p className="lm-sub rv rv-d2">No auditions, no fees, no guesswork — a short questionnaire, a parent’s yes, and a tutor who plays your instrument.</p>
          </div>
          <HowSteps />
          <div className="rv mt-10 text-center">
            <Link href="/how-it-works" className="text-[15px] font-semibold text-ink underline decoration-1 underline-offset-4">
              The full details
            </Link>
          </div>
        </div>
      </section>

      {/* One program, three people */}
      <section id="see" className={cn(s.sec, "scroll-mt-20 pt-0!")}>
        <div className="lm-wrap">
          <div className={s.head}>
            <p className="lm-eyebrow rv">Built for everyone in the room</p>
            <h2 className="lm-h2 rv rv-d1">
              One program. <em>Three</em> people it works for.
            </h2>
            <p className="lm-sub rv rv-d2">A student who wants help, a parent who wants to know what’s going on, and a teenager who wants to give back.</p>
          </div>
          <div className="rv rv-d1">
            <RoleSwitcher />
          </div>
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className={cn(s.panelOuter, "scroll-mt-20")}>
        <div className={cn("lm-sky", s.panel, s.safetyPanel)}>
          <div className={s.head}>
            <p className="lm-eyebrow rv">Safety &amp; transparency</p>
            <h2 className="lm-h2 rv rv-d1">
              Safety isn’t a policy here. <em>It’s the code.</em>
            </h2>
            <p className="lm-sub rv rv-d2">
              Everyone in a lesson is a minor, so the rules are enforced by the site itself. Phone numbers, emails, links, social apps and invitations to meet
              up never make it through.
            </p>
          </div>
          <div className="rv rv-d1">
            <SafetyDemo />
          </div>
          <SafetyPoints />
          <div className="rv mt-10 text-center">
            <Link href="/safety" className="lm-btn lm-btn-ink">
              Read the full safety policy <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Numbers that never change */}
      <section className={cn(s.sec, s.stats, "mt-[clamp(64px,8vw,112px)]")}>
        <div className="lm-wrap relative z-10">
          <div className={s.head}>
            <p className="lm-eyebrow rv">Why families trust it</p>
            <h2 className="lm-h2 rv rv-d1 text-[#f8f6ee]">
              Free lessons. Real hours. <em>No shortcuts.</em>
            </h2>
            <p className={cn("lm-sub rv rv-d2", s.lead)}>
              Consent, the messaging rules, the Google Meet window and the hour checks live in the database — the website can’t skip them, and neither can anyone
              else.
            </p>
          </div>
          <div className="rv">
            <StatTiles tiles={tiles} />
          </div>
          <p className={cn("lm-micro rv", s.statFoot)}>
            {stats && stats.active_tutors >= 5 ? "Live from the program database" : "Enforced by the database, not just written in a policy"}
          </p>
          <div className="rv mt-10 text-center">
            <Link href="/signup" className="lm-btn lm-btn-glow">
              Get started — it’s free <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Tutors */}
      <section id="hours" className={cn(s.sec, "scroll-mt-20")}>
        <div className="lm-wrap">
          <HoursChain />
        </div>
      </section>

      {/* Giving */}
      <section className={cn(s.sec, "pt-0!")}>
        <div className="lm-wrap">
          <div className={cn(s.head, "mb-12")}>
            <p className="lm-eyebrow rv">Giving back</p>
            <h2 className="lm-h2 rv rv-d1">
              Lessons are free. Giving back is <em>optional.</em>
            </h2>
          </div>
          <Cause config={config} />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={cn(s.sec, "scroll-mt-20 pt-0!")}>
        <div className="lm-wrap">
          <div className={s.head}>
            <p className="lm-eyebrow rv">Questions</p>
            <h2 className="lm-h2 rv rv-d1">
              What people <em>ask</em> us.
            </h2>
          </div>
          <FaqList items={FAQ_ITEMS} />
        </div>
      </section>

      {/* Closing CTA */}
      <section className={cn(s.panelOuter, "pb-[clamp(16px,2vw,28px)]")}>
        <div className={cn("lm-sky lm-sky-gold", s.panel, s.cta)}>
          <div className={cn(s.notch, "rv")}>
            <p className="lm-eyebrow">Ready when you are</p>
            <h2 className="lm-h2 mt-4">
              The next great player is <em>one lesson</em> away.
            </h2>
            <p className="lm-sub mx-auto mt-5 max-w-xl">
              Sign-up takes a few minutes. Students get matched with a tutor; tutors get a real way to give back with the thing they’re best at.
            </p>
            <div className={s.ctaBtns}>
              <Link href="/signup?role=student" className="lm-btn lm-btn-ink">
                <Music2 className="size-4" /> I’m a middle schooler
              </Link>
              <Link href="/signup?role=family" className="lm-btn lm-btn-glass">
                <Users className="size-4" /> I’m a parent
              </Link>
              <Link href="/signup?role=tutor" className="lm-btn lm-btn-glass">
                <GraduationCap className="size-4" /> I’m a high school musician
              </Link>
            </div>
            <p className="lm-micro mt-6">Free · Online · Parent-approved</p>
          </div>
        </div>
      </section>

    </>
  );
}
