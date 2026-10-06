"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, CalendarPlus, Check, HandHeart, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { MatchScore } from "@/components/dashboard/tutor-card";
import { goalLabel, interestLabel, LEVEL_INFO, type Level } from "@/lib/constants";
import { easternDateOffset, formatRelative } from "@/lib/time";
import { offerToTeach, proposeLesson } from "@/app/actions/lessons";
import { DateTimeFields, type DateTimeValue } from "@/components/forms/date-time-fields";
import { messageViolation } from "@/lib/moderation";
import { cn } from "@/lib/cn";

export interface StudentCardData {
  id: string;
  firstName: string;
  grade: number;
  county: string | null;
  subjects: { subjectId: string; name: string; level: Level }[];
  goals: string[];
  interests: string[];
  tutorCount: number;
  connected: boolean;
  offeredAt: string | null;
  threadId: string | null;
  match: {
    tier: "ideal" | "stretch" | "related" | "full";
    score: number;
    subjectId: string;
    reasons: string[];
    cautions: string[];
  } | null;
  /** Subjects this tutor can offer (exact or related) */
  offerable: { subjectId: string; name: string }[];
}

const TIER: Record<string, { label: string; tone: Tone }> = {
  ideal: { label: "Great match", tone: "pine" },
  stretch: { label: "Possible match", tone: "brass" },
  related: { label: "Related instrument", tone: "sky" },
  full: { label: "Match", tone: "neutral" },
};

export function StudentCard({ s, canOffer, blockedReason, durations }: { s: StudentCardData; canOffer: boolean; blockedReason?: string; durations: number[] }) {
  const [open, setOpen] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [subject, setSubject] = useState(s.match?.subjectId ?? s.offerable[0]?.subjectId ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tier = s.match ? TIER[s.match.tier] : null;
  const recentlyOffered = s.offeredAt && Date.now() - new Date(s.offeredAt).getTime() < 14 * 86400000;

  return (
    <article className={cn("flex flex-col rounded-2xl border border-line bg-card p-5 shadow-card", !s.match && "opacity-75")}>
      <div className="flex items-start gap-4">
        <Avatar name={s.firstName} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold">{s.firstName}</h3>
            {tier && <Badge tone={tier.tone}>{tier.label}</Badge>}
            {s.connected && <Badge tone="sky">Connected</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {s.grade}th grade{s.county ? ` · ${s.county} County` : ""}
            {s.tutorCount > 0 ? ` · has ${s.tutorCount} tutor${s.tutorCount === 1 ? "" : "s"}` : " · no tutor yet"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.subjects.map((x) => (
              <span key={x.subjectId} className="rounded-md bg-paper-2 px-2 py-0.5 text-[12px] text-ink-2">
                {x.name} · {LEVEL_INFO[x.level]?.label ?? x.level}
              </span>
            ))}
          </div>
        </div>
        {s.match && <MatchScore score={s.match.score} tier={s.match.tier} />}
      </div>

      <div className="mt-4 space-y-1.5 border-t border-line pt-4">
        {s.match ? (
          <>
            {s.match.reasons.slice(0, 3).map((r) => (
              <p key={r} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-pine-600" /> {r.replace(/when you are/, "when they are")}
              </p>
            ))}
            {s.match.cautions.slice(0, 1).map((r) => (
              <p key={r} className="flex gap-2 text-[13px] leading-snug text-muted">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-brass-600" /> {r.replace(/^Add your availability.*/, "They haven’t added availability yet")}
              </p>
            ))}
          </>
        ) : (
          <p className="text-[13px] text-muted">You don’t play any of {s.firstName}’s instruments (or a related one).</p>
        )}
        {(s.goals.length > 0 || s.interests.length > 0) && (
          <p className="pt-1 text-[12.5px] text-muted">
            {s.goals.length > 0 && <>Wants: {s.goals.map((g) => goalLabel(g).toLowerCase()).join(", ")}. </>}
            {s.interests.length > 0 && <>Likes: {s.interests.map((i) => interestLabel(i).toLowerCase()).join(", ")}.</>}
          </p>
        )}
      </div>

      <div className="mt-auto pt-4">
        {proposing ? (
          <ProposeForm s={s} durations={durations} onClose={() => setProposing(false)} />
        ) : sent ? (
          <Notice tone="success">
            Offer sent! {s.firstName} got an email.{" "}
            <Link href={`/dashboard/messages/${sent}`} className="font-medium underline underline-offset-2">
              Open the conversation
            </Link>
          </Notice>
        ) : s.connected && s.threadId ? (
          <div className="flex flex-wrap gap-2">
            {s.offerable.length > 0 && (
              <Button size="sm" onClick={() => setProposing(true)}>
                <CalendarPlus className="size-4" /> Propose a time
              </Button>
            )}
            <Link
              href={`/dashboard/messages/${s.threadId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-2 px-4 text-sm font-medium hover:border-ink/30"
            >
              <MessageCircle className="size-4" /> Message
            </Link>
          </div>
        ) : recentlyOffered ? (
          <div className="space-y-2">
            <p className="text-[13px] text-muted">You offered {formatRelative(s.offeredAt!)} — waiting for them to reply.</p>
            {canOffer && s.offerable.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setProposing(true)}>
                <CalendarPlus className="size-4" /> Propose a time
              </Button>
            )}
          </div>
        ) : !s.offerable.length ? null : !canOffer ? (
          <p className="text-[13px] text-muted">{blockedReason}</p>
        ) : open ? (
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const v = note.trim() ? messageViolation(note) : null;
              if (v) return setError(`Your note can’t include ${v}.`);
              start(async () => {
                setError(null);
                const r = await offerToTeach({ studentId: s.id, subjectId: subject, note });
                if (r?.ok) setSent(r.data!.threadId);
                else if (r) setError(r.error.message);
              });
            }}
          >
            {s.offerable.length > 1 && (
              <Select aria-label="Instrument" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {s.offerable.map((o) => (
                  <option key={o.subjectId} value={o.subjectId}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
            <Textarea
              aria-label="Short note"
              placeholder={`Optional note, e.g. “I’d love to help with ${s.goals[0] ? goalLabel(s.goals[0]).toLowerCase() : "fundamentals"}!” No contact info.`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              className="min-h-16"
            />
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" pending={pending}>
                Send offer
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-[11.5px] leading-snug text-faint">
              {s.firstName} (and their parent) see your offer and profile, then decide whether to request a lesson.
            </p>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setProposing(true)}>
              <CalendarPlus className="size-4" /> Propose a time
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              <HandHeart className="size-4" /> Offer to teach
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

const WEEK_CHOICES = [1, 4, 8, 12];

/** A tutor proposes a specific time (or weekly lessons). Nothing is booked until the family accepts. */
function ProposeForm({ s, durations, onClose }: { s: StudentCardData; durations: number[]; onClose: () => void }) {
  const [subject, setSubject] = useState(s.match?.subjectId ?? s.offerable[0]?.subjectId ?? "");
  const [dt, setDt] = useState<DateTimeValue>({ date: easternDateOffset(2), time: "", minutes: durations.includes(45) ? 45 : durations[0] });
  const [weeks, setWeeks] = useState(1);
  const [note, setNote] = useState("");
  const [attest, setAttest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) return <Notice tone="success">{done}</Notice>;
  return (
    <form
      noValidate
      className="space-y-3 animate-fade"
      onSubmit={(e) => {
        e.preventDefault();
        const v = note.trim() ? messageViolation(note) : null;
        if (v) return setError(`Your note can’t include ${v}.`);
        start(async () => {
          setError(null);
          const r = await proposeLesson({ studentId: s.id, subjectId: subject, ...dt, weeks, note, attest: attest as true });
          if (r?.ok) setDone(r.message ?? "Proposed!");
          else if (r) setError(r.error.message);
        });
      }}
    >
      <p className="eyebrow">Propose a lesson to {s.firstName}</p>
      {s.offerable.length > 1 && (
        <Select aria-label="Instrument" value={subject} onChange={(e) => setSubject(e.target.value)}>
          {s.offerable.map((o) => (
            <option key={o.subjectId} value={o.subjectId}>
              {o.name}
            </option>
          ))}
        </Select>
      )}
      <DateTimeFields value={dt} onChange={setDt} min={easternDateOffset(0)} max={easternDateOffset(89)} durations={durations} />
      <Select aria-label="How many weeks" value={String(weeks)} onChange={(e) => setWeeks(Number(e.target.value))}>
        {WEEK_CHOICES.map((w) => (
          <option key={w} value={w}>
            {w === 1 ? "Just this lesson" : `Weekly, ${w} weeks`}
          </option>
        ))}
      </Select>
      <Textarea aria-label="Short note" placeholder="Optional note. No contact info." value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="min-h-16" />
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-paper-2/60 p-3 text-[12.5px] leading-snug text-ink-2">
        <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 size-4 accent-pine-700" />
        <span>
          I’ll follow the <Link href="/legal/tutor-agreement" className="underline underline-offset-2" target="_blank">Tutor Agreement</Link>: online only, never recorded, a parent reachable, and all contact on this site.
        </span>
      </label>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" pending={pending} disabled={!attest || !dt.time}>
          Send proposal
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <p className="text-[11.5px] leading-snug text-faint">Nothing is booked until {s.firstName}’s family accepts. They can also suggest another time.</p>
    </form>
  );
}
