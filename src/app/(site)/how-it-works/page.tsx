import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  BookOpenCheck,
  CalendarClock,
  CalendarX2,
  Check,
  Clock3,
  Eye,
  GraduationCap,
  HeartHandshake,
  Mail,
  MessageSquareLock,
  Music2,
  Printer,
  ScanSearch,
  ShieldCheck,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { MusicDust } from "@/components/how/music-dust";
import { Tilt } from "@/components/how/tilt";
import { RoleBar } from "@/components/how/role-bar";
import { StickySteps } from "@/components/how/sticky-steps";
import { MatchStage } from "@/components/how/match-stage";
import { OnView } from "@/components/how/on-view";
import { Win } from "@/components/how/win";
import { cn } from "@/lib/cn";
import { SITE } from "@/lib/site";
import s from "@/components/how/how.module.css";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";

const DESCRIPTION = "How students and tutors are matched by instrument and level, how free online lessons are scheduled, and how volunteer hours are verified.";
export const metadata: Metadata = pageSeo("/how-it-works", "How it works", DESCRIPTION, { ownImage: true });

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Each card's wire into the hub, in the hub's 0–100 box. */
const HUB_PATHS = ["M25 14 Q 30 45, 50 50", "M75 22 Q 70 45, 50 50", "M25 84 Q 30 55, 50 50", "M75 88 Q 70 55, 50 50"];

const MATCH_FACTORS: [string, string, boolean][] = [
  ["Instrument", "Clarinet — the exact one", true],
  ["Level", "Wants to teach developing players", true],
  ["Schedule", "Free Thursday evenings, like Leo", true],
  ["Goals", "Strong at audition prep", true],
  ["Learning style", "Likes a clear plan and demonstrations", true],
  ["Interests", "Also loves film scores", false],
  ["Fair load", "Has open spots this term", true],
];

const TONES = ["bg-mint", "bg-peach", "bg-lilac", "bg-glow"];

const FIRST_LESSON: { icon: typeof Eye; t: string; d: string }[] = [
  { icon: Music2, t: "The instrument, ready to play", d: "Plus its small stuff: reeds, rosin, valve oil, sticks or a practice pad. Tuned and warmed up if you can." },
  { icon: BookOpenCheck, t: "Music and a pencil", d: "Whatever they’re working on at school, and a stand or something to prop the music up at eye level." },
  { icon: Video, t: "A laptop or tablet with a camera", d: "Set it to the side so the tutor sees hands and posture. A phone works, but a bigger screen helps." },
  { icon: Clock3, t: "A quiet room, five minutes early", d: "The lesson link opens on the site 15 minutes before. Close other tabs and apps so the sound stays clear." },
  { icon: UserRound, t: "No Google account needed", d: "Open the link, type the student’s first name, tap “Ask to join,” and the tutor lets you in. Phones and tablets need the free Meet app." },
  { icon: Users, t: "A parent home or nearby", d: "Reachable for the whole lesson. You don’t have to sit in, and the site asks you to confirm this before the link opens." },
];

const QUICK: [string, string][] = [
  ["How long is a lesson?", "30, 45 or 60 minutes, any quarter hour from 8 AM to 10 PM Eastern."],
  ["Can we try just one?", "Yes. Weekly is optional, and any upcoming lesson can be cancelled from your dashboard."],
  ["Is there a limit?", "No cap on lessons. A weekly booking covers up to 12 weeks, and you can book again."],
  ["What if the tutor doesn’t show?", "Report it as a missed lesson. It never counts toward their hours, and the team follows up."],
  ["Can we switch tutors?", "Any time, no explanation needed. Your other matches stay on your dashboard."],
];

export default function HowItWorksPage() {
  return (
    <>
      <JsonLd data={[webPageJsonLd({ path: "/how-it-works", name: "How it works", description: DESCRIPTION }), breadcrumbJsonLd([{ name: "How it works", path: "/how-it-works" }])]} />
      {/* 1 · Hero: music made of dust, headline on the right, the role bar. */}
      <section className={s.heroOuter}>
        <div className={s.heroPanel}>
          <MusicDust variant="hero" className={s.heroDust} />
          <div className={s.heroGrid}>
            <div className={s.heroArt} aria-hidden />
            <div>
              <p className={cn(s.tag, "animate-rise")}>How it works</p>
              <h1 className={cn("lm-h1 animate-rise [animation-delay:60ms]", s.heroTitle, s.accent)}>
                From one questionnaire to a <em>free lesson.</em>
              </h1>
              <p className="lm-sub mt-5 max-w-[560px] animate-rise [animation-delay:120ms]">
                Everything that happens between signing up and a tutor’s hours being verified — including the parts you’ll never have to think about.
              </p>
              <div className="animate-rise [animation-delay:180ms]">
                <RoleBar />
              </div>
              <p className="lm-micro mt-6 animate-rise [animation-delay:240ms]">Free, always · Never recorded · Parent consent first</p>
              <p className="mt-5 animate-rise text-[15px] text-ink-2 [animation-delay:300ms]">
                Rather read the rules first?{" "}
                <Link href="/safety" className="font-semibold text-pine-700 underline decoration-pine-700/30 underline-offset-4 hover:decoration-pine-700">
                  The safety policy <ArrowRight className="inline size-3.5 -translate-y-px" />
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <Ribbon />

      {/* 2 · How it works: pinned steps, changing window. */}
      <section id="steps" className="scroll-mt-20 pt-[clamp(72px,9vw,128px)] lg:pt-0">
        <StickySteps />
      </section>

      {/* 3 · The matching, as a live stage. */}
      <section className={s.sec}>
        <div className="lm-wrap">
          <div className={s.head}>
            <p className="lm-eyebrow rv">The matching</p>
            <h2 className={cn("lm-h2 rv rv-d1 mt-[18px] text-ink", s.accent, s.blurIn)}>
              The best fit, <em>not the oldest player.</em>
            </h2>
            <p className="lm-sub rv rv-d2 mx-auto mt-5 max-w-[660px]">
              Your student tells us what they play and when they’re free. We compare every tutor who plays it and show you the best fits — with the reasons, and
              anything less than ideal called out plainly.
            </p>
          </div>
          <div className="rv">
            <MatchStage />
          </div>
          <div className="rv mx-auto mt-10 flex max-w-[600px] flex-col items-center">
            <RoleBar className="mt-0 w-full" />
            <p className="lm-micro mt-5 text-center">
              No tutor for your instrument yet? We show clearly labelled related instruments, and{" "}
              <Link href="/waitlist" className="underline underline-offset-4">
                the waitlist
              </Link>{" "}
              emails you when one joins.
            </p>
          </div>
        </div>
      </section>

      {/* 4 · Split panel: safety hub. */}
      <section className={s.splitOuter}>
        <div className={s.split}>
          <div className="rv">
            <p className={s.tag}>Safety, built into the code</p>
            <h2 className={s.splitTitle}>
              Messages that <em>stay</em> on the platform.
            </h2>
            <p className="lm-sub mt-5 max-w-[520px]">
              Students and tutors talk inside the site, never anywhere else. Phone numbers, emails, links and social apps are blocked, our own software checks every
              message, and a parent can read every conversation.
            </p>
            <ul className="mt-7 grid gap-2.5 text-[15px] text-ink-2">
              {["No outside AI services read your messages", "Something serious hides the message and pauses the tutor", "Lessons are never recorded"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Check className="mt-1 size-4 shrink-0 text-pine-700" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <OnView className={s.hub}>
            <p className="sr-only">
              Example: a tutor’s message is delivered, a message with a phone number is blocked, the safety scan comes back clear, and the parent can read the whole
              conversation.
            </p>
            <div className={s.hubDust} aria-hidden />
            <svg className={s.links} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {HUB_PATHS.map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
            <svg className={s.pulses} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {HUB_PATHS.map((d, n) => (
                <circle key={d} r="0.9">
                  <animateMotion dur="2.6s" begin={`${n * 0.65}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
            </svg>
            <div className={cn(s.hubCard, s.hubA)} style={i(0)} aria-hidden>
              <div className="flex items-center gap-2">
                <Avatar name="Maya R" size={24} />
                <span className="font-semibold">Maya R. → Leo</span>
                <span className={cn(s.badge, s.badgeOk, "ml-auto")}>Sent</span>
              </div>
              <p className="mt-2 text-ink-2">“Great job on the scale today! Try it at 80 bpm before Thursday.”</p>
            </div>
            <div className={cn(s.hubCard, s.hubB)} style={i(1)} aria-hidden>
              <div className="flex items-center gap-2">
                <Ban className="size-4 text-clay-700" />
                <span className="font-semibold">Not sent</span>
                <span className={cn(s.badge, s.badgeNo, "ml-auto")}>Blocked</span>
              </div>
              <p className="mt-2 text-ink-2">
                “text me at <span className="rounded bg-clay-100 px-1 text-clay-800">919-•••-••••</span>”
              </p>
              <p className="mt-1 text-[11.5px] text-faint">Phone numbers never get through.</p>
            </div>
            <div className={s.hubCenter} aria-hidden>
              <span className={s.hubIcon}>
                <MessageSquareLock className="size-8" strokeWidth={1.6} />
              </span>
              <span className="text-[12px] font-medium text-ink-2">Messages on Teach for a Cause</span>
            </div>
            <div className={cn(s.hubCard, s.hubC)} style={i(2)} aria-hidden>
              <div className="flex items-center gap-2">
                <ScanSearch className="size-4 text-pine-700" />
                <span className="font-semibold">Safety scan</span>
                <span className={cn(s.badge, s.badgeOk, "ml-auto")}>Clear</span>
              </div>
              <p className="mt-1.5 text-[11.5px] text-faint">Checked on our own servers for secrecy, meet-ups and bullying.</p>
            </div>
            <div className={cn(s.hubCard, s.hubD)} style={i(3)} aria-hidden>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-pine-600" />
                <span className="font-semibold">Leo’s parent can read this</span>
              </div>
              <p className="mt-1.5 text-[11.5px] text-faint">Every message, from their own dashboard.</p>
            </div>
          </OnView>
        </div>
      </section>

      <Ribbon className="mt-[clamp(48px,6vw,80px)] -mb-[clamp(24px,3vw,48px)]" />

      {/* 5 · Feature windows. */}
      <section className={s.sec}>
        <div className="lm-wrap">
          <div className={s.head}>
            <p className={cn(s.tag, "rv")}>Under the hood</p>
            <h2 className={cn("lm-h2 rv rv-d1 mt-[22px] text-ink", s.accent, s.blurIn)}>
              Everything that happens <em>between the steps.</em>
            </h2>
          </div>
          <div className={s.featGrid}>
            <Feature
              title="Why this match"
              heading="Seven reasons, shown to you"
              body="Every match lists what lines up and what doesn’t. Tutors see the same scores from their side and can offer to teach."
            >
              <div className={cn(s.well, s.rowList, "py-1")}>
                {MATCH_FACTORS.map(([k, v, ok]) => (
                  <div key={k} className={s.row}>
                    {ok ? (
                      <span className={s.check}>
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : (
                      <span className={s.pending} />
                    )}
                    <span className="w-[92px] shrink-0 font-semibold">{k}</span>
                    <span className="truncate text-muted">{v}</span>
                  </div>
                ))}
              </div>
            </Feature>
            <Feature
              title="Lesson request"
              heading="Request, confirm, done"
              body="Any quarter hour from 8 AM to 10 PM Eastern, at least two hours ahead. Go back and forth until a time works — every step emails what to do next."
              delay
            >
              <div className={cn(s.well, "grid gap-3")}>
                <div className={s.row}>
                  <Avatar name="Leo" size={30} />
                  <div className="min-w-0">
                    <p className="font-semibold">Leo wants a lesson</p>
                    <p className="text-[12px] text-faint">Clarinet · 45 min · weekly</p>
                  </div>
                </div>
                <div className={cn(s.row, "rounded-xl bg-card px-3 py-2.5 ring-1 ring-line")}>
                  <CalendarClock className="size-4 text-brass-700" />
                  <b>Thu, 7:00 PM</b>
                  <span className="text-faint">Eastern</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-cream">Accept</span>
                  <span className="rounded-full border border-line-2 bg-card px-3.5 py-1.5 text-[12px] font-semibold">Suggest another time</span>
                  <span className="rounded-full px-2 py-1.5 text-[12px] text-muted">Decline</span>
                </div>
              </div>
              <div className={cn(s.well, s.row, "text-[12.5px]")}>
                <CalendarX2 className="size-4 text-clay-700" />
                <span>Double-booking is impossible — for tutors and students.</span>
              </div>
            </Feature>
            <Feature
              title="Parent dashboard"
              heading="A parent sees everything"
              body="Every message, every lesson, and a Sunday summary with what to practice. Report a concern or withdraw consent at any time."
            >
              <div className={cn(s.well, "grid gap-2.5")}>
                <div className={s.row}>
                  <Mail className="size-4 text-pine-700" />
                  <span className="font-semibold">Sunday summary</span>
                  <span className={cn(s.badge, "ml-auto")}>This week</span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-ink-2">1 lesson with Maya R. · 45 min. To practice: long tones, then the chromatic scale at 80 bpm.</p>
              </div>
              <div className={cn(s.well, s.rowList, "py-1")}>
                {[
                  [Eye, "Messages", "All readable"],
                  [Video, "Lessons", "2 upcoming"],
                  [ShieldCheck, "Consent", "Signed"],
                ].map(([Icon, k, v]) => {
                  const I = Icon as typeof Eye;
                  return (
                    <div key={k as string} className={s.row}>
                      <I className="size-4 text-muted" />
                      <span className="font-semibold">{k as string}</span>
                      <span className="ml-auto text-muted">{v as string}</span>
                    </div>
                  );
                })}
              </div>
            </Feature>
            <Feature
              title="Volunteer hours"
              heading="Every hour, on the record"
              body="Tutors get a printable record of verified hours. Whether they count for NHS, Tri-M or school is up to that organization — check with your advisor."
              delay
            >
              <div className={cn(s.well, "grid gap-1")}>
                <p className={s.label}>Maya R. · this term</p>
                <p className="font-serif text-[34px] leading-none">
                  12.75 <span className="text-[15px] text-muted">verified hours</span>
                </p>
              </div>
              <div className={cn(s.well, s.rowList, "py-1")}>
                {[
                  ["Oct 1 · Leo · 45 min", "Verified"],
                  ["Sep 24 · Leo · 45 min", "Verified"],
                  ["Sep 20 · Ava · 30 min", "Verified"],
                ].map(([t, b]) => (
                  <div key={t} className={s.row}>
                    <span>{t}</span>
                    <span className={cn(s.badge, s.badgeOk, "ml-auto")}>{b}</span>
                  </div>
                ))}
                <div className={cn(s.row, "text-muted")}>
                  <Printer className="size-4" />
                  <span>Print record</span>
                </div>
              </div>
            </Feature>
          </div>
        </div>
      </section>

      {/* 6 · Split panel: hour verification as a conversation. */}
      <section className={s.splitOuter}>
        <div className={s.split}>
          <div className="rv">
            <p className={s.tag}>Volunteer hours</p>
            <h2 className={s.splitTitle}>
              Three people agree <em>before an hour counts.</em>
            </h2>
            <p className="lm-sub mt-5 max-w-[520px]">
              Tutors log a lesson after it happens. The family confirms it too — unconfirmed lessons never count. Then, each week, our nonprofit partner reviews and
              verifies the hours.
            </p>
            <p className={s.code}>
              <span className="text-faint">booked</span> → <span>logged</span> → <span>confirmed</span> → <span className="text-pine-700">verified</span>
            </p>
          </div>
          <OnView className={s.chat}>
            <p className="sr-only">
              Example: Maya logs Thursday’s 45-minute lesson with Leo, Leo’s family confirms it, and the nonprofit partner verifies it in its weekly review, adding 0.75 hours to
              Maya’s record.
            </p>
            <div className="flex items-center gap-2.5 border-b border-line pb-3" aria-hidden>
              <LogoMark className="size-6" />
              <span className="text-[13px] font-semibold">Lesson #24 · Leo × Maya R.</span>
              <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-pine-700">
                <span className="size-1.5 rounded-full bg-pine-600" /> Thu, 7:00 PM
              </span>
            </div>
            <div className={cn(s.bubble, s.bubbleMe)} style={i(0)} aria-hidden>
              Logged: lesson with Leo happened · 45 min
            </div>
            <div className={s.bubble} style={i(1)} aria-hidden>
              <p className="flex items-center gap-2 font-semibold">
                <Users className="size-4 text-pine-700" /> Leo’s family confirmed it
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">One tap from the email, or when they next open the site. If they say it didn’t happen, it doesn’t count.</p>
            </div>
            <div className={s.bubble} style={i(2)} aria-hidden>
              <p className="flex items-center gap-2 font-semibold">
                <HeartHandshake className="size-4 text-brass-700" /> Verified by our nonprofit partner
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">In its weekly review of every confirmed lesson.</p>
            </div>
            <div className={cn(s.bubble, "border-pine-200 bg-pine-50")} style={i(3)} aria-hidden>
              <span className="font-semibold text-pine-800">Done.</span> 0.75 hours added to Maya’s record.
            </div>
          </OnView>
        </div>
      </section>

      <Ribbon className="mt-[clamp(48px,6vw,80px)] -mb-[clamp(24px,3vw,48px)]" />

      {/* 7 · Before the first lesson: what to have ready, and the questions families ask next. */}
      <section id="first-lesson" className={cn(s.sec, "scroll-mt-20")}>
        <div className="lm-wrap">
          <div className={s.head}>
            <p className={cn(s.tag, "rv")}>Before your first lesson</p>
            <h2 className={cn("lm-h2 rv rv-d1 mt-[22px] text-ink", s.accent, s.blurIn)}>
              Six things to have <em>ready.</em>
            </h2>
            <p className="lm-sub rv rv-d2 mx-auto mt-4 max-w-[600px]">Ten minutes of setup the first time, then it’s just open the link and play.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
            <ol className="grid gap-3 sm:grid-cols-2">
              {FIRST_LESSON.map(({ icon: Icon, t, d }, n) => (
                <li key={t} className={cn("rv rounded-[22px] border border-ink/10 bg-white p-5 shadow-card", n % 2 === 1 && "rv-d1")}>
                  <div className="flex items-center gap-3">
                    <span className={cn("flex size-10 items-center justify-center rounded-[13px] text-ink", TONES[n % TONES.length])} aria-hidden>
                      <Icon className="size-[18px]" strokeWidth={1.9} />
                    </span>
                    <span className="font-mono text-[11px] tracking-[0.14em] text-pine-700">{String(n + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-4 text-[16.5px] font-semibold tracking-[-0.01em] text-ink">{t}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d}</p>
                </li>
              ))}
            </ol>
            <div className="rv rv-d1 self-start rounded-[28px] border border-ink/10 bg-paper-2 p-6 sm:p-7">
              <p className="eyebrow">Quick answers</p>
              <dl className="mt-5 divide-y divide-ink/[0.08]">
                {QUICK.map(([q, a]) => (
                  <div key={q} className="py-4 first:pt-0 last:pb-0">
                    <dt className="font-semibold text-ink">{q}</dt>
                    <dd className="mt-1 text-[14.5px] leading-relaxed text-muted">{a}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/faq" className="lm-btn lm-btn-glass lm-btn-sm mt-6">
                Every question, by who’s asking <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 9 · Free for everyone (RaisedHand's pricing, without a price). */}
      <section className={cn(s.sec, "pt-0!")}>
        <div className="lm-wrap">
          <div className={s.head}>
            <h2 className={cn("lm-h2 rv text-ink", s.accent, s.blurIn)}>
              Lessons are free. <em>Always.</em>
            </h2>
            <p className="rv rv-d1 mt-4 text-[15px] text-muted">No fee, no subscription, no card. Nobody in the program ever asks you for money.</p>
          </div>
          <div className={s.planGrid}>
            <Plan
              eyebrow="For families"
              title="Free lessons"
              sub={`For middle schoolers in band or orchestra, anywhere in ${SITE.region}.`}
              listTitle="Ideal for families who want:"
              items={[
                [Music2, "One-on-one help on their child’s instrument"],
                [Eye, "To read every message and see every lesson"],
                [BookOpenCheck, "A Sunday summary with what to practice"],
              ]}
              href="/signup?role=family"
              cta="Sign up as a parent"
            />
            <Plan
              eyebrow="For high school musicians"
              title="Real hours"
              sub="For grades 9–12 who play in their school band or orchestra."
              listTitle="Ideal for tutors who want to:"
              items={[
                [GraduationCap, "Teach the instrument they love"],
                [Clock3, "Earn hours a nonprofit verifies"],
                [Printer, "Keep a printable teaching record"],
              ]}
              href="/signup?role=tutor"
              cta="Join as a tutor"
              pine
            />
          </div>
          <p className="rv mt-6 text-center text-[14px] text-muted">
            Middle schooler?{" "}
            <Link href="/signup?role=student" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
              Send your parent an invitation
            </Link>{" "}
            — they take it from there.
          </p>
        </div>
      </section>

      {/* 10 · The wordmark. */}
      <section className={s.wordOuter} aria-hidden>
        <div className={s.wordPanel}>
          <p className="lm-micro">Free lessons · Real hours · Parent-approved</p>
          <div className={s.wordBox}>
            <MusicDust variant="word" className={s.wordDust} />
            <p className={s.word}>
              Teach <em>for a</em> Cause
            </p>
          </div>
          <p className="lm-micro mt-4 hidden [@media(pointer:fine)]:block">Move through it. Click it.</p>
          <p className="lm-micro mt-4 [@media(pointer:fine)]:hidden">Tap it.</p>
        </div>
      </section>
    </>
  );
}

function Feature({ title, heading, body, children, delay }: { title: string; heading: string; body: string; children: React.ReactNode; delay?: boolean }) {
  return (
    <div className={cn("rv", delay && "rv-d1")}>
      <div className={s.featShot} aria-hidden>
        <Tilt max={5}>
          <Win title={title}>{children}</Win>
        </Tilt>
      </div>
      <h3 className="mt-6 text-[21px] font-semibold tracking-[-0.015em] text-ink">{heading}</h3>
      <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Plan({
  eyebrow,
  title,
  sub,
  listTitle,
  items,
  href,
  cta,
  pine,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  listTitle: string;
  items: [typeof Eye, string][];
  href: string;
  cta: string;
  pine?: boolean;
}) {
  return (
    <div className={cn(s.plan, "rv", pine && "rv-d1")}>
      <div className="px-[clamp(20px,3vw,30px)] pt-7">
        <p className="eyebrow">{eyebrow}</p>
        <p className="display mt-3 text-[40px]">{title}</p>
        <p className="mt-2 min-h-[2lh] text-[14.5px] text-muted">{sub}</p>
      </div>
      <div className={s.planArt} aria-hidden>
        <span className={cn(s.diamond, pine && s.diamondPine)} />
        <LogoMark className={cn(s.planMark, "size-16")} inverted={pine} />
      </div>
      <div className={s.planBody}>
        <p className="text-[14px] font-semibold text-ink">{listTitle}</p>
        <ul className="mt-3 grid gap-2.5 text-[14.5px] text-ink-2">
          {items.map(([Icon, t]) => (
            <li key={t} className="flex items-center gap-2.5">
              <Icon className="size-4 shrink-0 text-muted" />
              {t}
            </li>
          ))}
        </ul>
        <LinkButton href={href} size="lg" variant={pine ? "primary" : "brass"} className="mt-7 w-full">
          {cta} <ArrowRight className="size-4" />
        </LinkButton>
      </div>
    </div>
  );
}

/** A strip of the dotted staff, notes playing as they cross the middle. */
function Ribbon({ className }: { className?: string }) {
  return <MusicDust variant="ribbon" className={cn(s.ribbon, className)} />;
}
