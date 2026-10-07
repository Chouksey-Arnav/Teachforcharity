"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Users } from "lucide-react";
import { WaitlistForm } from "@/components/site/waitlist-form";
import { Select } from "@/components/ui/field";
import { supplyStatus, type InstrumentSupply } from "@/lib/public-forms";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";

/** The marquee's instruments, by section colour, keyed to the database's instrument slugs. */
const MARQUEE: [string, string, string][] = [
  ["Flute", "woodwind", "flute"],
  ["Violin", "strings", "violin"],
  ["Trumpet", "brass", "trumpet"],
  ["Clarinet", "woodwind", "clarinet"],
  ["Cello", "strings", "cello"],
  ["Concert percussion", "percussion", "percussion"],
  ["Alto sax", "woodwind", "alto-saxophone"],
  ["Trombone", "brass", "trombone"],
  ["Viola", "strings", "viola"],
  ["Piano", "keyboard", "piano"],
  ["Oboe", "woodwind", "oboe"],
  ["French horn", "brass", "french-horn"],
  ["Double bass", "strings", "double-bass"],
  ["Mallets", "percussion", "mallets"],
  ["Bassoon", "woodwind", "bassoon"],
  ["Euphonium", "brass", "euphonium"],
  ["Tenor sax", "woodwind", "tenor-saxophone"],
  ["Harp", "strings", "harp"],
  ["Tuba", "brass", "tuba"],
  ["Drum set", "percussion", "drum-set"],
  ["Bass clarinet", "woodwind", "bass-clarinet"],
  ["Guitar", "strings", "guitar"],
  ["Timpani", "percussion", "timpani"],
  ["Piccolo", "woodwind", "piccolo"],
  ["Bari sax", "woodwind", "baritone-saxophone"],
  ["Bass trombone", "brass", "bass-trombone"],
  ["English horn", "woodwind", "english-horn"],
  ["Bass guitar", "strings", "bass-guitar"],
];

const tutors = (n: number) => `${n} ${n === 1 ? "tutor" : "tutors"}`;

/**
 * Every instrument we teach, and what's true for each one today: how many tutors are taking new students, or a
 * waitlist when nobody is. Counts only, never names. Clicking a moving chip picks it in the finder; the finder's
 * own select is the keyboard and screen-reader way in. `supply` is null when counts can't be loaded, and then no
 * counts are shown (never zeros that aren't true).
 */
export function InstrumentFinder({ supply }: { supply: InstrumentSupply[] | null }) {
  const bySlug = useMemo(() => new Map((supply ?? []).map((i) => [i.slug, i])), [supply]);
  const options = useMemo(
    () => (supply?.length ? supply.map(({ slug, name }) => ({ slug, name })) : MARQUEE.map(([name, , slug]) => ({ slug, name }))).sort((a, b) => a.name.localeCompare(b.name)),
    [supply],
  );
  const [slug, setSlug] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const picked = slug ? bySlug.get(slug) : undefined;
  const pickedName = options.find((o) => o.slug === slug)?.name;
  const status = picked ? supplyStatus(picked) : slug ? "waitlist" : null;
  const openNow = (supply ?? []).filter((i) => i.open > 0).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  const pick = (next: string) => {
    setSlug(next);
    panel.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const half = Math.ceil(MARQUEE.length / 2);
  const rows = [MARQUEE.slice(0, half), MARQUEE.slice(half)];

  return (
    <section id="instruments" className={cn(s.marqueeSec, "scroll-mt-20")} aria-labelledby="instruments-h">
      <h2 id="instruments-h" className="lm-eyebrow rv">
        Every band &amp; orchestra instrument
      </h2>
      <p className="rv rv-d1 mx-auto mt-3 max-w-[560px] px-4 text-[15px] text-muted">Tap yours to see who’s teaching it right now.</p>
      <div className={cn(s.marquee, "rv rv-d1")} aria-hidden>
        {rows.map((row, r) => (
          <div key={r} className={cn(s.track, r === 1 && s.trackRev)}>
            {[...row, ...row].map(([name, fam, key], n) => {
              const i = bySlug.get(key);
              const st = i ? supplyStatus(i) : "waitlist";
              return (
                <button
                  key={`${key}-${n}`}
                  type="button"
                  tabIndex={-1}
                  onClick={() => pick(key)}
                  className={cn(s.instChip, s.instBtn, n >= row.length && s.trackDup, slug === key && s.instOn)}
                >
                  <i className={s[`fam-${fam}`]} />
                  {name}
                  {supply && (
                    <span className={cn(s.instCount, st === "open" && s.instCountOpen)}>{st === "open" && i ? tutors(i.open) : st === "related" ? "Related tutor" : "Waitlist"}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div ref={panel} className={cn(s.finder, "lm-frost rv scroll-mt-24")}>
        <div className={s.finderTop}>
          <label htmlFor="finder-instrument" className="text-[15px] font-semibold text-ink">
            What does your student play?
          </label>
          <Select id="finder-instrument" value={slug} onChange={(e) => setSlug(e.target.value)} className="sm:w-72">
            <option value="">Choose an instrument…</option>
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>

        <div aria-live="polite">
          {!slug && !supply && (
            <p className="mt-4 text-left text-[14px] leading-relaxed text-muted">
              Pick yours to see your options, or join its waitlist. Real tutor profiles appear after a parent signs consent.{" "}
              <Link href="#preview" className="font-medium text-ink underline underline-offset-4">
                See a sample profile
              </Link>
            </p>
          )}

          {!slug && supply && (
            <div className="mt-5 text-left">
              <p className="lm-micro">Taking new students right now</p>
              {openNow.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {openNow.map((o) => (
                    <li key={o.slug}>
                      <button type="button" onClick={() => setSlug(o.slug)} className={s.openChip}>
                        {o.name} · {tutors(o.open)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[14.5px] text-muted">New tutors are joining now. Pick your instrument to join its waitlist.</p>
              )}
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                Counts only. Real tutor profiles appear after a parent signs consent.{" "}
                <Link href="#preview" className="font-medium text-ink underline underline-offset-4">
                  See a sample profile
                </Link>
              </p>
            </div>
          )}

          {status === "open" && picked && (
            <div className="mt-5 animate-fade text-left">
              <p className="flex items-start gap-3 text-[16px] leading-snug text-ink">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-mint text-pine-800">
                  <Check className="size-4" strokeWidth={2.6} />
                </span>
                <span>
                  <b className="font-semibold">{tutors(picked.open)}</b> who {picked.open === 1 ? "teaches" : "teach"} {picked.name.toLowerCase()} {picked.open === 1 ? "is" : "are"} taking new students.
                  <span className="mt-1 block text-[14px] text-muted">A parent signs up and signs consent, then your best matches appear right away.</span>
                </span>
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href="/signup?role=family" className="lm-btn lm-btn-ink lm-btn-sm">
                  Sign up as a parent <ArrowRight className="size-4" />
                </Link>
                <Link href="/signup?role=student" className="text-[14.5px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
                  I’m the student
                </Link>
              </div>
            </div>
          )}

          {(status === "related" || status === "waitlist") && slug && (
            <div className="mt-5 animate-fade text-left">
              <p className="flex items-start gap-3 text-[16px] leading-snug text-ink">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-peach text-ink">
                  <Users className="size-4" />
                </span>
                <span>
                  {supply ? (
                    <>
                      No {pickedName?.toLowerCase()} tutor yet.
                      {status === "related" && picked && (
                        <> {tutors(picked.related)} who {picked.related === 1 ? "plays" : "play"} a closely related instrument can help in the meantime.</>
                      )}
                    </>
                  ) : (
                    <>Want to know when a {pickedName?.toLowerCase()} tutor is free?</>
                  )}
                  <span className="mt-1 block text-[14px] text-muted">Leave an email and we’ll send one note when a tutor for it joins. It also tells us which instruments to recruit for.</span>
                </span>
              </p>
              <WaitlistForm instruments={options} instrument={slug} onInstrumentChange={setSlug} reason="instrument" idPrefix="finder" className="mt-5" />
              {status === "related" && (
                <p className="mt-4 text-[13.5px] text-muted">
                  Or{" "}
                  <Link href="/signup?role=family" className="font-semibold text-ink underline underline-offset-4">
                    sign up now
                  </Link>{" "}
                  to see related-instrument tutors, clearly labelled.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
