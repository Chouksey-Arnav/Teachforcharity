"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Send, Siren } from "lucide-react";
import { sendContactMessage } from "@/app/actions/public";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Submit } from "@/components/ui/submit";
import { CONTACT_ROLES, CONTACT_TOPICS, type ContactTopic } from "@/lib/public-forms";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

const MAX = 4000;

/** /contact. Reaches the program team with no account; a signed-in person's account is attached automatically. */
export function ContactForm({ initialTopic, signedIn, defaults }: { initialTopic: ContactTopic; signedIn: boolean; defaults: { name: string; email: string } }) {
  const [state, action] = useActionState<ActionState<{ topic: string }>, FormData>(sendContactMessage, null);
  // Controlled, so a rejected submission never wipes what someone took the time to write.
  const [v, setV] = useState({ topic: initialTopic as string, name: defaults.name, email: defaults.email, role: "", message: "" });
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const concern = v.topic === "concern";

  if (state?.ok) {
    return (
      <div className="animate-rise rounded-[28px] border border-pine-200 bg-pine-50 p-7 sm:p-9" role="status">
        <span className="flex size-11 items-center justify-center rounded-full bg-mint text-pine-800">
          <Check className="size-5" strokeWidth={2.4} />
        </span>
        <p className="display mt-5 text-[28px]">
          {state.data?.topic === "concern" ? (
            <>
              Thank you for <em>telling us.</em>
            </>
          ) : (
            <>
              Message <em>received.</em>
            </>
          )}
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          {state.data?.topic === "concern"
            ? "The program team has been alerted and will review it. If anyone is in immediate danger, call 911."
            : "A person on the program team will reply to the email you gave us, usually within a couple of days."}
        </p>
        <Link href="/" className="lm-btn lm-btn-glass lm-btn-sm mt-6">
          Back to the home page
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6" noValidate>
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="c-hp">Leave this field empty</label>
        <input id="c-hp" name="hp_leave_blank" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset>
        <legend className="mb-2.5 text-[14px] font-semibold text-ink">What’s this about?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CONTACT_TOPICS.map((t) => (
            <label
              key={t.key}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/80 p-3.5 transition",
                v.topic === t.key ? (t.key === "concern" ? "border-clay-700 ring-4 ring-clay-500/15" : "border-ink ring-4 ring-glow/45") : "border-ink/14 hover:border-ink/25",
              )}
            >
              <input type="radio" name="topic" value={t.key} checked={v.topic === t.key} onChange={() => setV({ ...v, topic: t.key })} className="sr-only" />
              <span
                className={cn("mt-1 size-3.5 shrink-0 rounded-full border", v.topic === t.key ? (t.key === "concern" ? "border-[5px] border-clay-700" : "border-[5px] border-ink") : "border-ink/30")}
                aria-hidden
              />
              <span className="min-w-0">
                <span className={cn("block text-[14.5px] font-semibold", t.key === "concern" ? "text-clay-800" : "text-ink")}>{t.label}</span>
                {t.hint && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.hint}</span>}
              </span>
            </label>
          ))}
        </div>
        {fe.topic && <p className="mt-2 text-[13px] text-clay-700">{fe.topic}</p>}
      </fieldset>

      {concern && (
        <div className="animate-fade flex gap-3 rounded-2xl border border-clay-500/30 bg-clay-50 p-4">
          <Siren className="mt-0.5 size-5 shrink-0 text-clay-700" aria-hidden />
          <div className="text-[14px] leading-relaxed text-ink-2">
            <p className="font-semibold text-clay-800">If someone is in immediate danger, call 911 first.</p>
            <p className="mt-1">
              {signedIn ? (
                <>
                  Because you’re signed in, the fastest route is{" "}
                  <Link href="/dashboard/report" className="font-semibold text-ink underline underline-offset-4">
                    Report a concern in your dashboard
                  </Link>
                  : a safety report about a connected tutor pauses them on the spot. This form reaches the same team.
                </>
              ) : (
                <>
                  This form goes straight to the program team. Have an account? Reporting from your dashboard also pauses a connected tutor on the spot.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="c-name" error={fe.name}>
          <Input id="c-name" name="name" autoComplete="name" maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required aria-invalid={Boolean(fe.name)} />
        </Field>
        <Field label="Email we can reply to" htmlFor="c-email" error={fe.email}>
          <Input
            id="c-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={v.email}
            onChange={(e) => setV({ ...v, email: e.target.value })}
            required
            aria-invalid={Boolean(fe.email)}
          />
        </Field>
      </div>
      <Field label="I’m a…" htmlFor="c-role" optional>
        <Select id="c-role" name="role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
          <option value="">Choose one…</option>
          {CONTACT_ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={concern ? "What happened?" : "Your message"}
        htmlFor="c-message"
        error={fe.message}
        hint={concern ? `Who was involved, when, and what you saw. Include a tutor’s name if you know it. ${v.message.length}/${MAX}` : `${v.message.length}/${MAX}`}
      >
        <Textarea
          id="c-message"
          name="message"
          rows={6}
          maxLength={MAX}
          value={v.message}
          onChange={(e) => setV({ ...v, message: e.target.value })}
          required
          aria-invalid={Boolean(fe.message)}
        />
      </Field>

      {state && !state.ok && !Object.keys(fe).length && <Notice tone="danger">{state.error.message}</Notice>}

      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-relaxed text-muted sm:max-w-xs">
          Only the program team sees this. We use your email to reply, nothing else.{" "}
          <Link href="/legal/privacy#waitlist" className="underline underline-offset-2">
            Privacy
          </Link>
        </p>
        <Submit size="lg" variant={concern ? "danger" : "primary"} pendingText="Sending…">
          <Send className="size-4" /> {concern ? "Send report" : "Send message"}
        </Submit>
      </div>
    </form>
  );
}
