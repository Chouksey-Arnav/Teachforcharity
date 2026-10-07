"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { joinWaitlist, type WaitlistResult } from "@/app/actions/public";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Submit } from "@/components/ui/submit";
import { US_STATES, WAITLIST_GRADES } from "@/lib/public-forms";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

export type WaitlistReason = "instrument" | "region" | "grade";

const REASONS: { key: WaitlistReason; label: string }[] = [
  { key: "instrument", label: "No tutor for my instrument" },
  { key: "region", label: "I don’t live in North Carolina" },
  { key: "grade", label: "My child isn’t in 6th grade yet" },
];

/**
 * "Email me when…" with no account. One email address, one reason, and one email back from us when it changes.
 * `reason` fixes the reason (the home page's instrument finder); otherwise the person picks it.
 */
export function WaitlistForm({
  instruments,
  instrument,
  onInstrumentChange,
  reason: fixedReason,
  defaultReason = "instrument",
  defaultInstrument = "",
  idPrefix = "wl",
  className,
}: {
  instruments: { slug: string; name: string }[];
  /** Controlled instrument (the finder above picks it). */
  instrument?: string;
  onInstrumentChange?: (slug: string) => void;
  reason?: WaitlistReason;
  defaultReason?: WaitlistReason;
  defaultInstrument?: string;
  idPrefix?: string;
  className?: string;
}) {
  const [state, action] = useActionState<ActionState<WaitlistResult>, FormData>(joinWaitlist, null);
  const [reason, setReason] = useState<WaitlistReason>(fixedReason ?? defaultReason);
  const [ownInstrument, setOwnInstrument] = useState(instrument ?? defaultInstrument);
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("");
  const [grade, setGrade] = useState("");
  const slug = instrument ?? ownInstrument;
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const id = (k: string) => `${idPrefix}-${k}`;
  const name = instruments.find((i) => i.slug === slug)?.name;

  // A new instrument picked above starts a new sign-up.
  const [doneFor, setDoneFor] = useState<string | null>(null);
  useEffect(() => {
    if (state?.ok) setDoneFor(`${state.data?.reason}:${slug}`);
  }, [state]);
  const done = state?.ok && state.data && doneFor === `${state.data.reason}:${slug}` ? state.data : null;

  if (done) {
    return (
      <div className={cn("animate-rise rounded-2xl border border-pine-200 bg-pine-50 p-5", className)} role="status">
        <p className="flex items-center gap-2 font-semibold text-pine-900">
          <Check className="size-5" strokeWidth={2.4} /> You’re on the list
        </p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
          {done.status === "open" ? (
            <>
              Good news: there’s a {name?.toLowerCase() ?? ""} tutor taking students right now.{" "}
              <Link href="/signup?role=family" className="font-semibold text-ink underline underline-offset-4">
                Sign up
              </Link>{" "}
              to see them. We saved your spot on the list anyway.
            </>
          ) : done.reason === "instrument" ? (
            <>
              We’ll email <strong>{done.email}</strong> once, when a tutor who teaches {name?.toLowerCase() ?? "your instrument"} (or a closely related one) joins.
            </>
          ) : (
            <>
              We’ll email <strong>{done.email}</strong> if we open up to {done.reason === "region" ? "your state" : "your child’s grade"}.
            </>
          )}{" "}
          Every email has a one-click link to leave the list.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={cn("space-y-4", className)} noValidate>
      {/* Bots fill this in; people never see it. */}
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={id("hp")}>Leave this field empty</label>
        <input id={id("hp")} name="hp_leave_blank" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="reason" value={reason} />

      {!fixedReason && (
        <fieldset>
          <legend className="mb-2 text-[14px] font-semibold text-ink">What are you waiting for?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {REASONS.map((r) => (
              <label
                key={r.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-3 text-[14px] leading-snug transition",
                  reason === r.key ? "border-ink bg-white font-semibold text-ink ring-4 ring-glow/45" : "border-ink/14 bg-white/70 text-ink-2 hover:border-ink/25",
                )}
              >
                <input type="radio" name="reason-choice" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="sr-only" />
                <span className={cn("size-3.5 shrink-0 rounded-full border", reason === r.key ? "border-[5px] border-ink" : "border-ink/30")} aria-hidden />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* When the finder above already picked the instrument, don't ask again. */}
        {reason === "instrument" && instrument !== undefined && <input type="hidden" name="instrument" value={slug} />}
        {reason === "instrument" && instrument === undefined && (
          <Field label="Instrument" htmlFor={id("instrument")} error={fe.instrument}>
            <Select
              id={id("instrument")}
              name="instrument"
              value={slug}
              onChange={(e) => (onInstrumentChange ? onInstrumentChange(e.target.value) : setOwnInstrument(e.target.value))}
              aria-invalid={Boolean(fe.instrument)}
            >
              <option value="">Choose an instrument…</option>
              {instruments.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {reason === "region" && (
          <Field label="Where you live" htmlFor={id("region")} error={fe.region}>
            <Select id={id("region")} name="region" value={region} onChange={(e) => setRegion(e.target.value)} aria-invalid={Boolean(fe.region)}>
              <option value="">Choose a state…</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {reason === "grade" && (
          <Field label="Grade this school year" htmlFor={id("grade")} error={fe.grade}>
            <Select id={id("grade")} name="grade" value={grade} onChange={(e) => setGrade(e.target.value)} aria-invalid={Boolean(fe.grade)}>
              <option value="">Choose a grade…</option>
              {WAITLIST_GRADES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Parent or guardian’s email" htmlFor={id("email")} error={fe.email} hint="Students: ask a parent to fill this in.">
          <Input
            id={id("email")}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={Boolean(fe.email)}
          />
        </Field>
      </div>

      {state && !state.ok && !Object.keys(fe).length && <Notice tone="danger">{state.error.message}</Notice>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-relaxed text-muted sm:max-w-sm">
          No account needed. One email when it changes, nothing else, and we delete your address within 30 days of sending it.{" "}
          <Link href="/legal/privacy#waitlist" className="underline underline-offset-2">
            Privacy
          </Link>
        </p>
        <Submit pendingText="Adding you…" className="shrink-0">
          <BellRing className="size-4" /> Email me
        </Submit>
      </div>
    </form>
  );
}
