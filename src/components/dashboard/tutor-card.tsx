import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarClock, Check, Star } from "lucide-react";
import type { DirectoryTutor } from "@/lib/data";
import { TIER_LABEL, type MatchResult } from "@/lib/matching";
import { LEVEL_INFO, ensembleLabel } from "@/lib/constants";
import { formatTime } from "@/lib/time";
import { friendlyDay, type OpenSlot } from "@/lib/slots";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

const TIER_TONE: Record<MatchResult["tier"], Tone> = { ideal: "pine", stretch: "brass", related: "sky", full: "neutral" };

export function MatchScore({ score, tier, size = 48 }: { score: number; tier: MatchResult["tier"]; size?: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const color = tier === "ideal" ? "#2A6A57" : tier === "full" ? "#8C958F" : tier === "related" ? "#2F5470" : "#A87B2A";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`Match score ${score} out of 100`}>
      <svg viewBox="0 0 44 44" className="size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="#EFEAE0" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold" aria-label={`Match score ${score} out of 100`}>
        {score}
      </span>
    </div>
  );
}

/** `href` plus a preselected time, landing on the booking form. */
export function bookingHref(href: string, slot?: OpenSlot) {
  if (!slot) return `${href}#book`;
  return `${href}${href.includes("?") ? "&" : "?"}slot=${encodeURIComponent(slot.start)}#book`;
}

/** Cautions that open times make redundant (the card shows real times instead). */
const SUPERSEDED = /^(No shared times yet|Add your availability)/;

export function TutorCard({
  tutor,
  match,
  href,
  slots,
}: {
  tutor: DirectoryTutor;
  match?: MatchResult;
  href: string;
  /** Requestable times (soonest first). Omit to hide the "next open" row. */
  slots?: OpenSlot[];
}) {
  const current = match?.reasons.some((r) => r.startsWith("Already working with")) ?? false;
  const subjects = match ? [match.subject, ...tutor.subjects.filter((s) => s.subjectId !== match.subject.subjectId)] : tutor.subjects;
  const primary = subjects[0];
  const full = match ? !match.canRequest : !tutor.acceptingStudents;
  const cautions = (match?.cautions ?? []).filter((c) => !(slots?.length && SUPERSEDED.test(c)));
  const reasons = (match?.reasons ?? []).filter((r) => !r.startsWith("Already working with"));
  const firstDay = slots?.[0]?.date;
  const dayChips = slots?.filter((s) => s.date === firstDay).slice(0, 3) ?? [];

  return (
    <article
      className={cn(
        "group relative flex min-w-0 flex-col rounded-2xl border bg-card shadow-card transition hover:-translate-y-0.5 hover:border-line-2 hover:shadow-lift focus-within:shadow-lift",
        current ? "border-pine-200" : "border-line",
        full && "bg-paper/40",
      )}
    >
      <div className="flex items-start gap-3.5 p-5 pb-4">
        <Avatar name={tutor.displayName} path={tutor.avatarPath} size={52} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold leading-tight">
            {/* The title link covers the whole card; inner links sit above it. */}
            <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-pine-600">
              {tutor.displayName}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {tutor.grade ? `${tutor.grade}th grade` : "High school"}
            {tutor.school ? ` · ${tutor.school}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {current ? <Badge tone="pine">Your tutor</Badge> : match && <Badge tone={TIER_TONE[match.tier]}>{TIER_LABEL[match.tier]}</Badge>}
            {subjects.slice(0, 2).map((s) => (
              <span key={s.subjectId} className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[12px] text-ink-2">
                {s.name}
              </span>
            ))}
            {subjects.length > 2 && <span className="px-1 py-0.5 text-[12px] text-muted">+{subjects.length - 2}</span>}
          </div>
        </div>
        {match && <MatchScore score={match.score} tier={match.tier} size={46} />}
      </div>

      {match ? (
        (reasons.length > 0 || cautions.length > 0) && (
          <ul className="space-y-1.5 px-5 pb-4">
            {reasons.slice(0, 2).map((r) => (
              <li key={r} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-pine-600" aria-hidden /> {r}
              </li>
            ))}
            {cautions.slice(0, full ? 1 : 2).map((r) => (
              <li key={r} className="flex gap-2 text-[13px] leading-snug text-muted">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-brass-600" aria-hidden /> {r}
              </li>
            ))}
          </ul>
        )
      ) : (
        primary && (
          <p className="px-5 pb-4 text-[13px] leading-snug text-muted">
            Teaches {primary.teachLevels.map((l) => LEVEL_INFO[l].label.toLowerCase()).join(", ")} {primary.name.toLowerCase()} · {ensembleLabel(primary.topEnsemble)}
          </p>
        )
      )}

      {slots && !full && (
        <div className="mx-5 mb-4 rounded-xl bg-paper-2/60 px-3.5 py-3">
          {slots.length ? (
            <>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
                <CalendarClock className="size-3.5" aria-hidden /> Next open · <span className="text-ink">{friendlyDay(firstDay!)}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dayChips.map((s) => (
                  <Link
                    key={s.start}
                    href={bookingHref(href, s)}
                    aria-label={`Book ${friendlyDay(s.date)} at ${formatTime(s.start)}${s.both ? ", fits your free times" : ""}`}
                    className={cn(
                      "relative z-10 inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition",
                      s.both ? "border-pine-200 bg-pine-50 text-pine-800 hover:border-pine-600" : "border-line-2 bg-card text-ink-2 hover:border-ink/30",
                    )}
                  >
                    {s.both && <Star className="size-3 fill-current" aria-hidden />}
                    {formatTime(s.start)}
                  </Link>
                ))}
                {slots.length > dayChips.length && (
                  <Link href={bookingHref(href)} className="relative z-10 inline-flex h-8 items-center px-1.5 text-[13px] font-medium text-pine-700 hover:underline">
                    +{slots.length - dayChips.length} more
                  </Link>
                )}
              </div>
            </>
          ) : (
            <p className="text-[12.5px] leading-snug text-muted">No open times in the next two weeks — you can still suggest one.</p>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-line px-5 py-3">
        <span className="text-xs text-muted">
          {tutor.lessonsCompleted > 0 ? `${tutor.lessonsCompleted} lesson${tutor.lessonsCompleted === 1 ? "" : "s"} taught` : "New tutor"}
          {" · "}
          {tutor.sessionMinutes.join("/")} min
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-pine-700 transition-all group-hover:gap-1.5" aria-hidden>
          {full ? "View profile" : "View & book"} <ArrowRight className="size-4" />
        </span>
      </div>
    </article>
  );
}
