import { CalendarClock, Mail, MapPin, School, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/** A ribbon that can't be missed: these are made up, so nobody mistakes them for a real child or tutor. */
function SampleTag({ children }: { children: string }) {
  return (
    <span className="absolute -top-3 left-5 z-10 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-glow shadow-card">
      <span className="size-1.5 rounded-full bg-glow" aria-hidden /> {children}
    </span>
  );
}

const REASONS = ["Teaches clarinet, the exact instrument", "Wants to teach developing players, like Leo", "Free Thursday evenings and Saturday mornings", "Strong at reading music and audition prep"];

/**
 * What a parent sees after signing consent, laid out like the real tutor profile and the real Sunday email, with
 * made-up people. Shown before sign-up so nobody has to commit blind.
 */
export function Previews() {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
      {/* Sample tutor profile: the header of /dashboard/tutors/[id]. */}
      <figure className="rv relative">
        <SampleTag>Sample profile · not a real tutor</SampleTag>
        <div className="rounded-[28px] border border-line bg-card p-5 shadow-lift sm:p-7" aria-hidden>
          <div className="flex items-start gap-4">
            <Avatar name="Maya R" size={64} />
            <div className="min-w-0 flex-1">
              <Badge tone="pine">Great match</Badge>
              <p className="display mt-1.5 text-[32px] sm:text-4xl">Maya R.</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <School className="size-4" /> 11th grade
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" /> Wake County
                </span>
              </p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-3 divide-x divide-line rounded-2xl bg-paper-2/60 py-3 text-center">
            {[
              ["Lessons", "14"],
              ["Verified hrs", "10.5"],
              ["Lengths", "30/45m"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt>
                <dd className="mt-0.5 text-[17px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-center gap-2 text-[14px] text-ink-2">
            <CalendarClock className="size-4 text-pine-700" /> Next open time: <strong className="font-semibold text-ink">Thursday at 7:00 PM</strong>
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            “I’ve played clarinet for six years and sit second chair in Wind Ensemble. I love helping people get past the break and actually enjoy
            practicing.”
          </p>
          <div className="mt-5 rounded-2xl border border-line p-4">
            <p className="text-[13px] font-semibold text-ink">Why Maya fits Leo</p>
            <ul className="mt-2.5 space-y-1.5 text-[13.5px] text-ink-2">
              {REASONS.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pine-600" /> {r}
                </li>
              ))}
              <li className="flex gap-2 text-muted">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brass-500" /> Doesn’t list jazz, which Leo picked as a goal
              </li>
            </ul>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-faint">Skill levels are self-reported by the tutor. Contact details are never shown.</p>
        </div>
        <figcaption className="mt-4 px-1 text-[14.5px] leading-relaxed text-muted">
          <b className="font-semibold text-ink">What you’ll see for each tutor.</b> Their grade, county, lesson record and own words, why they fit your child,
          and anything less than ideal, called out plainly. Never a phone number, email or school address.
        </figcaption>
      </figure>

      {/* Sample Sunday summary: the weekly_digest email. */}
      <figure className="rv rv-d1 relative">
        <SampleTag>Sample email · made-up family</SampleTag>
        <div className="overflow-hidden rounded-[28px] border border-line bg-paper-2 shadow-lift" aria-hidden>
          <div className="flex items-center gap-3 border-b border-line bg-card px-5 py-3.5 text-[13px]">
            <span className="flex size-8 items-center justify-center rounded-full bg-pine-50 text-pine-700">
              <Mail className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">Leo’s week in music</p>
              <p className="truncate text-muted">Teach for a Cause · Sunday, 4:00 PM</p>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <p className="px-1 pb-3 font-serif text-[18px] italic text-pine-900">Teach for a Cause</p>
            <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
              <p className="font-serif text-[24px] leading-tight text-ink">Leo’s week</p>
              <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-ink-2">
                <p>Hi Pat,</p>
                <p>This week: Clarinet with Maya R. on Thursday at 7:00 PM ET (confirmed).</p>
                <p>
                  <b className="font-semibold text-ink">What to practice:</b>
                  <br />• Long tones, five minutes a day
                  <br />• F major scale, slurred, at 80 bpm
                  <br />• Concert piece, measures 12–24, slowly first
                </p>
                <p>Coming up: Clarinet with Maya R. on Thursday at 7:00 PM ET.</p>
                <p>3 messages were exchanged with tutors this week. You can read them all in Messages.</p>
              </div>
              <span className="mt-5 inline-flex rounded-full bg-pine-700 px-5 py-2.5 text-[13.5px] font-semibold text-white">Open your dashboard →</span>
            </div>
          </div>
        </div>
        <figcaption className="mt-4 px-1 text-[14.5px] leading-relaxed text-muted">
          <b className="font-semibold text-ink">What lands in your inbox on Sundays.</b> What happened, what to practice, what’s next, and how many messages
          were sent, every one of which you can read.
        </figcaption>
      </figure>
    </div>
  );
}

/** The one-line reason the real profiles wait for consent. */
export function PreviewNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start justify-center gap-2 text-center text-[14px] text-muted", className)}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden />
      Real profiles unlock after a parent signs consent, so nobody can browse tutors, or be browsed, without a parent’s OK.
    </p>
  );
}
