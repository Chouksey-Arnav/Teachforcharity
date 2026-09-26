import Link from "next/link";
import { AlertCircle, ArrowRight, Check } from "lucide-react";
import type { DirectoryTutor } from "@/lib/data";
import { TIER_LABEL, type MatchResult } from "@/lib/matching";
import { LEVEL_INFO, ensembleLabel } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

const TIER_TONE: Record<MatchResult["tier"], Tone> = { ideal: "pine", stretch: "brass", related: "sky", full: "neutral" };

export function MatchScore({ score, tier }: { score: number; tier: MatchResult["tier"] }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const color = tier === "ideal" ? "#2A6A57" : tier === "full" ? "#8C958F" : tier === "related" ? "#2F5470" : "#A87B2A";
  return (
    <div className="relative size-12 shrink-0" title={`Match score ${score}/100`}>
      <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#EFEAE0" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold">{score}</span>
    </div>
  );
}

export function TutorCard({
  tutor,
  match,
  href,
  studentName,
}: {
  tutor: DirectoryTutor;
  match?: MatchResult;
  href: string;
  studentName?: string;
}) {
  const subjects = match ? [match.subject, ...tutor.subjects.filter((s) => s.subjectId !== match.subject.subjectId)] : tutor.subjects;
  const primary = subjects[0];
  return (
    <article className={cn("group flex flex-col rounded-2xl border bg-card p-5 shadow-card transition hover:shadow-lift", match?.tier === "full" ? "border-line opacity-80" : "border-line")}>
      <div className="flex items-start gap-4">
        <Avatar name={tutor.displayName} path={tutor.avatarPath} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold">{tutor.displayName}</h3>
            {match && <Badge tone={TIER_TONE[match.tier]}>{TIER_LABEL[match.tier]}</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {tutor.grade ? `${tutor.grade}th grade` : "High school"}
            {tutor.school ? ` · ${tutor.school}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {subjects.slice(0, 3).map((s) => (
              <span key={s.subjectId} className="rounded-md bg-paper-2 px-2 py-0.5 text-[12px] text-ink-2">
                {s.name}
              </span>
            ))}
          </div>
        </div>
        {match && <MatchScore score={match.score} tier={match.tier} />}
      </div>

      {match ? (
        <div className="mt-4 space-y-1.5 border-t border-line pt-4">
          {match.reasons.slice(0, 3).map((r) => (
            <p key={r} className="flex gap-2 text-[13px] leading-snug text-ink-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-pine-600" /> {r}
            </p>
          ))}
          {match.cautions.slice(0, 2).map((r) => (
            <p key={r} className="flex gap-2 text-[13px] leading-snug text-muted">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-brass-600" /> {r}
            </p>
          ))}
        </div>
      ) : (
        primary && (
          <p className="mt-4 border-t border-line pt-4 text-[13px] text-muted">
            Teaches {primary.teachLevels.map((l) => LEVEL_INFO[l].label.toLowerCase()).join(", ")} {primary.name.toLowerCase()} · {ensembleLabel(primary.topEnsemble)}
          </p>
        )
      )}

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs text-muted">
          {tutor.lessonsCompleted > 0 ? `${tutor.lessonsCompleted} lesson${tutor.lessonsCompleted === 1 ? "" : "s"} taught` : "New tutor"}
        </span>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-pine-700 group-hover:gap-2 transition-all">
          {match?.canRequest === false ? "View profile" : studentName ? `View & request` : "View profile"} <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}
