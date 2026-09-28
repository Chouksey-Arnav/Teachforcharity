import type { ReactNode } from "react";
import { ArrowUpRight, CalendarCheck2, Check, HeartHandshake, MessageSquareLock, PhoneCall, ShieldCheck, VideoOff, Wifi } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import type { PublicConfig } from "@/lib/viewer";
import { cn } from "@/lib/cn";

/** The illustrative match card in the hero. Clearly labelled as an example. */
export function ExampleMatch() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-y-8 inset-x-0 staff-bg sm:-inset-x-6 opacity-70 [mask-image:radial-gradient(closest-side,black,transparent)]" aria-hidden />
      <div className="relative rotate-[-1.2deg] rounded-3xl border border-line bg-card p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Example match</span>
          <span className="rounded-full bg-pine-50 px-2.5 py-0.5 text-xs font-medium text-pine-800 ring-1 ring-inset ring-pine-200">Great match · 94</span>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center text-center">
            <Avatar name="Leo" size={52} />
            <p className="mt-2 text-sm font-semibold">Leo</p>
            <p className="text-xs text-muted">7th grade · clarinet</p>
            <p className="text-xs text-muted">Developing</p>
          </div>
          <svg viewBox="0 0 60 20" className="w-14 text-brass-500" aria-hidden>
            <path d="M2 10h50" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
            <path d="M50 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex flex-col items-center text-center">
            <Avatar name="Maya R" size={52} />
            <p className="mt-2 text-sm font-semibold">Maya R.</p>
            <p className="text-xs text-muted">11th grade · clarinet</p>
            <p className="text-xs text-muted">All-District</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2 border-t border-line pt-4 text-[13px] text-ink-2">
          {["Focuses on beginner & developing clarinet", "Free when Leo is: Thu evening, Sat morning", "Strong at fundamentals & audition prep"].map((r) => (
            <li key={r} className="flex gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-pine-600" />
              {r}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative -mt-3 ml-auto w-[78%] rotate-[1.5deg] rounded-2xl border border-line bg-card p-4 shadow-lift">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brass-100 text-brass-800">
            <CalendarCheck2 className="size-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold">Lesson booked</p>
            <p className="text-xs text-muted">Thursday, 7:00 PM · 45 min · Google Meet</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WhoItsFor() {
  const items = [
    {
      n: "01",
      title: "For students",
      body: "One-on-one help you rarely get in a full band room — whether you just picked up the instrument or you're working on an All-District etude.",
    },
    {
      n: "02",
      title: "For high school tutors",
      body: "Teach what you love, build a real teaching record, and earn volunteer hours that our nonprofit partner verifies — not just our word for it.",
    },
    {
      n: "03",
      title: "For the community",
      body: "Families who want to give back can donate directly to our partner's current cause. Never required, and never in exchange for a lesson.",
    },
  ];
  return (
    <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
      {items.map((i) => (
        <div key={i.n} className="bg-card p-7 sm:p-8">
          <span className="font-serif text-2xl italic text-brass-600">{i.n}</span>
          <h3 className="mt-6 text-lg font-semibold text-ink">{i.title}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{i.body}</p>
        </div>
      ))}
    </div>
  );
}

export const STEPS = [
  {
    title: "Sign up in a few minutes",
    body: "Students (or a parent) answer a short questionnaire — instrument, level, goals, favorite music, and when they're free. A parent approves before any lesson or message.",
  },
  {
    title: "Get matched",
    body: "Instrument first, then level, schedule, goals, learning style, and the music you love. A beginner gets a tutor who wants to teach beginners — not whoever has played the longest.",
  },
  {
    title: "Request a time",
    body: "Pick a day and time, or accept a tutor's offer. The tutor confirms, and everyone gets an email and a calendar invite. Choose weekly to book the same time every week.",
  },
  {
    title: "Learn on Google Meet",
    body: "Lessons happen on your tutor's own Meet link. Afterward, you confirm the lesson happened — that's what makes their volunteer hours count.",
  },
];

export function Steps({ tone = "light" }: { tone?: "light" | "card" }) {
  return (
    <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.title} className={cn("relative rounded-2xl p-6", tone === "card" ? "border border-line bg-card" : "bg-paper-2/70")}>
          <span className="display text-5xl text-pine-700/90">{i + 1}</span>
          <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export const SAFETY_POINTS: { icon: typeof Wifi; title: string; body: string }[] = [
  { icon: Wifi, title: "Online only", body: "Every lesson happens on Google Meet. There are no in-person meetings — not now, not ever." },
  { icon: VideoOff, title: "Never recorded", body: "We don't record lessons and never store video of minors. The site has no recording feature at all." },
  { icon: PhoneCall, title: "A parent is always nearby", body: "A parent or guardian must be home or nearby and reachable for the whole lesson. They don't have to sit in." },
  { icon: ShieldCheck, title: "A parent says yes first", body: "Parents create students' accounts and sign consent, and we confirm it's really them with a short phone call before anything unlocks." },
  {
    icon: MessageSquareLock,
    title: "Messages stay on the platform",
    body: "Phone numbers, emails, links, and social apps are blocked, our own software checks every message for safety concerns, and a parent can read every conversation.",
  },
  { icon: HeartHandshake, title: "Concerns are acted on", body: "Any report — from a student, a parent, or our safety scanner — goes straight to the program team. A safety report pauses the tutor immediately." },
];

export function SafetyGrid({ inverted = true }: { inverted?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SAFETY_POINTS.map(({ icon: Icon, title, body }) => (
        <div key={title} className={cn("rounded-2xl p-6", inverted ? "bg-white/[0.06] ring-1 ring-inset ring-white/10" : "border border-line bg-card")}>
          <Icon className={cn("size-6", inverted ? "text-brass-300" : "text-pine-700")} strokeWidth={1.6} />
          <h3 className={cn("mt-4 font-semibold", inverted ? "text-white" : "text-ink")}>{title}</h3>
          <p className={cn("mt-1.5 text-[14.5px] leading-relaxed", inverted ? "text-white/70" : "text-muted")}>{body}</p>
        </div>
      ))}
    </div>
  );
}

export function HoursTimeline({ compact }: { compact?: boolean }) {
  const states = [
    { t: "Booked", d: "Tutor and family agree on a time." },
    { t: "Logged", d: "After the lesson, the tutor logs that it happened." },
    { t: "Confirmed", d: "The family confirms it too. Unconfirmed lessons never count." },
    { t: "Verified", d: "Each week, our nonprofit partner reviews and verifies the hours." },
  ];
  return (
    <ol className={cn("grid gap-0 sm:grid-cols-4", compact && "text-sm")}>
      {states.map((s, i) => (
        <li key={s.t} className="relative flex gap-4 pb-6 sm:block sm:pb-0 sm:pr-6">
          <div className="flex flex-col items-center sm:flex-row">
            <span
              className={cn(
                "z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-paper",
                i === 3 ? "bg-pine-700 text-white" : "bg-card text-ink ring-offset-0 border border-line-2",
              )}
            >
              {i === 3 ? <Check className="size-4" /> : i + 1}
            </span>
            {i < 3 && <span className="w-px flex-1 bg-line-2 sm:h-px sm:w-full sm:flex-1" aria-hidden />}
          </div>
          <div className="sm:mt-4">
            <p className="font-semibold text-ink">{s.t}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{s.d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CauseCard({ config, className }: { config: PublicConfig | null; className?: string }) {
  const p = config?.partner;
  return (
    <div className={cn("overflow-hidden rounded-3xl border border-line bg-card", className)}>
      <div className="grid md:grid-cols-[1.2fr_1fr]">
        <div className="p-7 sm:p-10">
          <p className="eyebrow">Current cause</p>
          <h3 className="display mt-3 text-3xl sm:text-4xl">{p ? p.cause_title : "Our partner's cause will be posted here"}</h3>
          {p && (
            <p className="mt-2 text-sm font-medium text-ink-2">
              {p.partnership_confirmed ? "With our nonprofit partner " : "Chosen by "}
              {p.website_url ? (
                <a href={p.website_url} target="_blank" rel="noopener noreferrer" className="text-pine-700 underline underline-offset-4">
                  {p.name}
                </a>
              ) : (
                p.name
              )}
            </p>
          )}
          {p?.cause_description && <p className="mt-4 text-[15px] leading-relaxed text-muted">{p.cause_description}</p>}
          <div className="mt-7">
            {p?.donation_url ? (
              <a
                href={p.donation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brass-500 px-5 text-sm font-semibold text-pine-950 transition hover:bg-brass-300"
              >
                Donate on {p.short_name}&apos;s website <ArrowUpRight className="size-4" />
              </a>
            ) : (
              <span className="inline-flex h-11 items-center rounded-full border border-dashed border-line-2 px-5 text-sm text-muted">
                Donation link coming soon
              </span>
            )}
          </div>
        </div>
        <div className="grain border-t border-line bg-paper-2/70 p-7 sm:p-10 md:border-l md:border-t-0">
          <h4 className="font-semibold">How giving works</h4>
          <ul className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-ink-2">
            {[
              "Lessons are always free. Donating is optional and never expected in exchange for a lesson.",
              "Donations go directly to the nonprofit through its own website.",
              `${"Teach for a Cause"} never collects, holds, or passes along money — not from families, not to tutors.`,
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check className="mt-1 size-4 shrink-0 text-pine-600" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-line rounded-3xl border border-line bg-card">
      {items.map((i) => (
        <details key={i.q} className="group px-6 py-5 sm:px-8">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] font-medium text-ink">
            {i.q}
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-2 text-muted transition group-open:rotate-45">
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">{i.a}</div>
        </details>
      ))}
    </div>
  );
}

export const FAQ_ITEMS = [
  {
    q: "Does it really cost nothing?",
    a: "Yes. Lessons are free, always. There's no fee, no subscription, and no payment information anywhere on the site. Families can choose to donate to our partner nonprofit's cause, directly on the partner's own website — but that's never required and has nothing to do with getting lessons.",
  },
  {
    q: "Who are the tutors?",
    a: "High school students (grades 9–12) who play in their school band or orchestra, many in top ensembles or All-District groups. Each tutor fills out a skill questionnaire and signs a tutor agreement, and their own parent or guardian has to approve before they can teach. Tutors are volunteers, not certified teachers, and skill levels are self-reported — we show you exactly what each tutor told us. Any safety report or safety-scan alert pauses a tutor immediately.",
  },
  {
    q: "Can my middle schooler sign up on their own?",
    a: "Not quite. A parent or guardian creates the account and adds their child, and a student can't make one alone. If your student starts on the sign-up page, they can send you an invitation email, and you take it from there. After you sign the consent form, someone from the program calls to confirm it's you, usually within two days.",
  },
  {
    q: "What does a parent need to do?",
    a: "Create the account, add your child, sign the consent form, and take a two-minute call from us. During each lesson, be home or nearby and reachable — you don't need to sit in. From your account you can read every message, see every lesson, get a Sunday summary with what to practice, and report a concern or withdraw consent at any time.",
  },
  {
    q: "How are students and tutors matched?",
    a: "Instrument comes first. Then we look at your student's level and the levels each tutor wants to teach, when you're both free, what your student wants to work on, and how they like to learn. We deliberately don't favor the most experienced tutor — a patient tutor who loves teaching beginners is usually the better match for a beginner. We also spread students across tutors so nobody gets overloaded.",
  },
  {
    q: "What if there's no tutor for my student's instrument?",
    a: "You'll see tutors who play a closely related instrument (for example, a saxophone player for a clarinet student) clearly labelled as such. You can also ask us to email you the moment a tutor for your student's instrument joins, and the program team sees which instruments families are waiting on so we can recruit for them.",
  },
  {
    q: "Do the volunteer hours count for NHS, Tri-M, or school requirements?",
    a: "Hours are logged by the tutor, confirmed by the family, and verified by our nonprofit partner each week, and you can print a record of them. Whether they count toward a specific school or honor society requirement is up to that organization — please check with your advisor.",
  },
  {
    q: "Can we message the tutor?",
    a: "Yes, inside the site. Phone numbers, emails, links, social media, and inappropriate language are blocked automatically, and our own safety software (no outside AI services) checks messages for things like requests for secrecy, meeting in person, or bullying — hiding a message and pausing a tutor automatically when something is serious. Parents can read every message.",
  },
];
