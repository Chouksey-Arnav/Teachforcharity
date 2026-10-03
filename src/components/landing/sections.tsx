import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Video } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { SAFETY_POINTS } from "@/components/site/sections";
import type { PublicConfig } from "@/lib/viewer";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";

/** Every instrument the program lists (supabase seed), grouped by section colour. */
const INSTRUMENTS: [string, string][] = [
  ["Flute", "woodwind"],
  ["Violin", "strings"],
  ["Trumpet", "brass"],
  ["Clarinet", "woodwind"],
  ["Cello", "strings"],
  ["Concert percussion", "percussion"],
  ["Alto sax", "woodwind"],
  ["Trombone", "brass"],
  ["Viola", "strings"],
  ["Piano", "keyboard"],
  ["Oboe", "woodwind"],
  ["French horn", "brass"],
  ["Double bass", "strings"],
  ["Mallets", "percussion"],
  ["Bassoon", "woodwind"],
  ["Euphonium", "brass"],
  ["Tenor sax", "woodwind"],
  ["Harp", "strings"],
  ["Tuba", "brass"],
  ["Drum set", "percussion"],
  ["Bass clarinet", "woodwind"],
  ["Guitar", "strings"],
  ["Timpani", "percussion"],
  ["Piccolo", "woodwind"],
  ["Bari sax", "woodwind"],
  ["Bass trombone", "brass"],
  ["English horn", "woodwind"],
  ["Bass guitar", "strings"],
];

export function InstrumentMarquee({ open }: { open: { name: string; tutors: number }[] }) {
  const half = Math.ceil(INSTRUMENTS.length / 2);
  const rows = [INSTRUMENTS.slice(0, half), INSTRUMENTS.slice(half)];
  return (
    <section className={s.marqueeSec} aria-labelledby="instruments-h">
      <h2 id="instruments-h" className="lm-eyebrow rv">
        Every band &amp; orchestra instrument
      </h2>
      <p className="sr-only">{INSTRUMENTS.map(([n]) => n).join(", ")}.</p>
      <div className={cn(s.marquee, "rv rv-d1")} aria-hidden>
        {rows.map((row, r) => (
          <div key={r} className={cn(s.track, r === 1 && s.trackRev)}>
            {[...row, ...row].map(([name, fam], n) => (
              <span key={`${name}-${n}`} className={cn(s.instChip, n >= row.length && s.trackDup)}>
                <i className={s[`fam-${fam}`]} />
                {name}
              </span>
            ))}
          </div>
        ))}
      </div>
      {open.length > 0 && (
        <div className={cn(s.openNow, "lm-wrap rv")}>
          <h3 className="lm-micro">Taking new students right now</h3>
          <ul>
            {open.slice(0, 12).map((o) => (
              <li key={o.name}>
                {o.name} · {o.tutors} {o.tutors === 1 ? "tutor" : "tutors"}
              </li>
            ))}
            {open.length > 12 && <li>+{open.length - 12} more</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

export function HowSteps({ phoneCheck }: { phoneCheck: boolean }) {
  return (
    <div className={s.steps}>
      {[1, 2].map((n) => (
        <span key={n} className={s.flowArrow} style={{ ["--n" as string]: n }} aria-hidden>
          <ArrowRight className="size-[15px]" />
        </span>
      ))}
      <article className={cn(s.step, "rv")}>
        <div className={s.stepVisual}>
          <Image src="/images/piano.jpg" alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1020px) 50vw, 400px" />
          <div className={cn(s.stepGlass, s.stepGlassLight)} aria-hidden>
            <p className={s.glassLabel}>Parent consent</p>
            <div className={s.consentRow}>
              I approve lessons for Leo
              <span className={s.switch} />
            </div>
            <span className={cn(s.chip, s.chipOk, s.loopChip)}>
              <Check className="size-3" strokeWidth={3} /> Approved
            </span>
          </div>
        </div>
        <div className={s.stepCopy}>
          <p className={s.stepNum}>01 · Sign up</p>
          <h3>A parent says yes first</h3>
          <p>
            A parent creates the account, adds their middle schooler and signs consent.
            {phoneCheck ? " A quick call or a hand-signed form confirms it’s really them." : " Nothing unlocks until they do."}
          </p>
        </div>
      </article>
      <article className={cn(s.step, "rv rv-d1")}>
        <div className={s.stepVisual}>
          <Image src="/images/saxophone.jpg" alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1020px) 50vw, 400px" className="object-[50%_30%]" />
          <div className={cn(s.stepGlass, "lm-glass")} aria-hidden>
            <p className={s.glassLabel}>
              <LogoMark className="size-3.5" inverted /> Matching
            </p>
            <ul className={s.criteria}>
              <li>
                <b>Instrument</b>
                <span>✓</span>
              </li>
              <li>
                <b>Level</b>
                <span>✓</span>
              </li>
              <li>
                <b>When you’re free</b>
                <span>✓</span>
              </li>
              <li>
                <b>Goals &amp; style</b>
                <span>✓</span>
              </li>
            </ul>
          </div>
        </div>
        <div className={s.stepCopy}>
          <p className={s.stepNum}>02 · Match</p>
          <h3>Instrument first, then the rest</h3>
          <p>Then level, schedule, goals and how you like to learn. A beginner gets someone who wants to teach beginners — not just whoever has played longest.</p>
        </div>
      </article>
      <article className={cn(s.step, "rv rv-d2")}>
        <div className={s.stepVisual}>
          <Image src="/images/violinist.jpg" alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1020px) 50vw, 400px" className="object-[60%_40%]" />
          <div className={cn(s.stepGlass, s.stepGlassLight)} aria-hidden>
            <p className={s.glassLabel}>
              <span className={s.liveDot} /> Today
            </p>
            <p className={s.meetTime}>Thursday · 7:00 PM</p>
            <p className={s.meetSub}>
              <Video className="mr-1 inline size-3.5 -translate-y-px" />
              Google Meet · link opens 15 min before
            </p>
          </div>
        </div>
        <div className={s.stepCopy}>
          <p className={s.stepNum}>03 · Play</p>
          <h3>Learn one-on-one, online</h3>
          <p>Request a time — or the same time every week. Lessons happen on Google Meet, and a parent is home or nearby the whole time.</p>
        </div>
      </article>
    </div>
  );
}

export function SafetyPoints() {
  return (
    <div className={s.points}>
      {SAFETY_POINTS.map(({ icon: Icon, title, body }, n) => (
        <div key={title} className={cn(s.point, "rv", n % 3 === 1 && "rv-d1", n % 3 === 2 && "rv-d2")}>
          <Icon className="size-5 text-[#1f5446]" strokeWidth={1.8} aria-hidden />
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      ))}
    </div>
  );
}

const CHAIN = [
  { t: "Booked", who: "Tutor + family", d: "You agree on a time. Everyone gets an email and a calendar invite." },
  { t: "Logged", who: "Tutor", d: "After the lesson, you log that it happened." },
  { t: "Confirmed", who: "Family", d: "The family confirms it too. Unconfirmed lessons never count." },
  { t: "Verified", who: "Nonprofit partner", d: "Each week our partner reviews and verifies the hours. Then they’re on your record." },
];
// Until a partner confirms in writing (Admin → Settings), the program team verifies hours — say so.
const CHAIN_UNCONFIRMED = [
  ...CHAIN.slice(0, 3),
  { t: "Verified", who: "Program team", d: "Each week the program team reviews and verifies the hours. Then they’re on your record." },
];

export function HoursChain({ partnered }: { partnered: boolean }) {
  const chain = partnered ? CHAIN : CHAIN_UNCONFIRMED;
  return (
    <div className={s.hoursGrid}>
      <div className={cn(s.hoursPhoto, "rv")}>
        <Image src="/images/sax-section.jpg" alt="A band’s saxophone section under warm stage lights" fill sizes="(max-width: 1020px) 100vw, 520px" />
        <div className={cn("lm-glass", s.hoursBadge)}>
          <span className="lm-wave" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f4d36f]">Three people sign off on every hour</span>
        </div>
      </div>
      <div>
        <p className="lm-eyebrow rv">For high school tutors</p>
        <h2 className="lm-h2 rv rv-d1 mt-4">
          Volunteer hours that <em>actually</em> count.
        </h2>
        <p className="lm-sub rv rv-d2 mt-5">
          An hour only counts after three different people agree it happened. That’s what makes the record credible
          {partnered ? " — it’s verified by our nonprofit partner, not just by us." : " — the tutor, the family, and the program team who verifies it each week."}
        </p>
        <ol className={cn(s.chain, "rv rv-d2")}>
          {chain.map((c, n) => (
            <li key={c.t} className={s.link}>
              <span className={s.node}>{n === 3 ? <Check className="size-4" strokeWidth={2.5} /> : n + 1}</span>
              <div>
                <p className={s.linkTitle}>
                  {c.t}
                  <span className={s.linkWho}>{c.who}</span>
                </p>
                <p className={s.linkBody}>{c.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rv mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/signup?role=tutor" className="lm-btn lm-btn-ink">
            Volunteer as a tutor <ArrowRight className="size-4" />
          </Link>
          <Link href="/volunteer" className="text-[15px] font-semibold text-ink underline decoration-1 underline-offset-4">
            What tutoring involves
          </Link>
        </div>
        <p className="mt-6 text-[13px] leading-relaxed text-[#6b736e]">
          Whether verified hours count toward NHS, Tri-M or a school requirement is up to each school or organization — check with your advisor.
        </p>
      </div>
    </div>
  );
}

export function Cause({ config }: { config: PublicConfig | null }) {
  const p = config?.partner;
  return (
    <div className={cn(s.cause, "rv")}>
      <div className={s.causeMain}>
        <p className="lm-micro">Current cause</p>
        <h3 className="mt-3 font-serif text-[clamp(26px,3vw,38px)] font-[560] leading-tight tracking-[-0.015em] [font-variation-settings:'opsz'_40]">
          {p ? p.cause_title : "Our partner’s cause will be posted here"}
        </h3>
        {p && (
          <p className="mt-2 text-sm font-medium text-ink/80">
            {p.partnership_confirmed ? "With our nonprofit partner " : "Chosen by "}
            {p.website_url ? (
              <a href={p.website_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {p.name}
              </a>
            ) : (
              p.name
            )}
          </p>
        )}
        {p?.cause_description && <p className="mt-4 text-[15.5px] leading-relaxed text-[#4b5550]">{p.cause_description}</p>}
        <div className="mt-8">
          {p?.donation_url ? (
            <a href={p.donation_url} target="_blank" rel="noopener noreferrer" className="lm-btn lm-btn-glow">
              Donate on {p.short_name}’s website <ArrowUpRight className="size-4" />
            </a>
          ) : (
            <span className="inline-flex rounded-full border border-dashed border-ink/20 px-5 py-3 text-sm text-[#6b736e]">Donation link coming soon</span>
          )}
        </div>
      </div>
      <div className={cn(s.causeSide, "lm-sky lm-sky-gold")}>
        <h4 className="font-semibold">How giving works</h4>
        <ul className="mt-4 space-y-3.5 text-[15px] leading-relaxed text-ink/85">
          {[
            "Lessons are always free. Donating is optional and never expected in exchange for a lesson.",
            "Donations go directly to the nonprofit, on its own website.",
            "Teach for a Cause never collects, holds or passes along money — not from families, not to tutors.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-1 size-4 shrink-0 text-[#1f5446]" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function FaqList({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className={s.faq}>
      {items.map((i) => (
        <details key={i.q} className="rv">
          <summary>
            {i.q}
            <span className={s.plus} aria-hidden />
          </summary>
          <div className={s.faqA}>{i.a}</div>
        </details>
      ))}
    </div>
  );
}
