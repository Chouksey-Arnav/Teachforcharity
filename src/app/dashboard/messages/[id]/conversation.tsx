"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Flag, Lock, SendHorizontal, ShieldCheck, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markThreadRead } from "@/app/actions/messages";
import { acceptMessagingTerms } from "@/app/actions/profile";
import { MESSAGE_MAX, messageViolation } from "@/lib/moderation";
import { easternDateOffset, easternParts, formatDate, formatTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";

interface Msg {
  id: string;
  sender_id: string | null;
  kind: "template" | "custom" | "system";
  body: string;
  created_at: string;
  /** Shown right away while the server saves it. */
  sending?: boolean;
}

/** Messages from the same person within this long read as one group. */
const GROUP_MS = 5 * 60_000;

function dayHeading(iso: string) {
  const d = easternParts(new Date(iso)).date;
  if (d === easternDateOffset(0)) return "Today";
  if (d === easternDateOffset(-1)) return "Yesterday";
  return formatDate(iso);
}

export function Conversation({
  threadId,
  me,
  otherId,
  otherName,
  tutorId,
  studentId,
  initial,
  templates,
  termsAccepted,
  paused,
  studentAccount,
}: {
  threadId: string;
  me: string;
  otherId: string;
  otherName: string;
  tutorId: string;
  studentId: string;
  initial: Msg[];
  templates: { key: string; label: string; body: string }[];
  termsAccepted: boolean;
  paused: boolean;
  studentAccount?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [shown, addSending] = useOptimistic(messages, (cur: Msg[], m: Msg) => [...cur, m]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(termsAccepted);
  const [agree, setAgree] = useState(false);
  const [tray, setTray] = useState(!termsAccepted);
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  // Touch keyboards: Enter adds a new line and the Send button sends (set after mount to match the server render).
  const [coarse, setCoarse] = useState(false);
  useEffect(() => setCoarse(window.matchMedia?.("(pointer: coarse)").matches ?? false), []);

  // Clear the unread badge in the nav once the conversation is open.
  useEffect(() => {
    void markThreadRead(threadId).then(() => router.refresh());
  }, [threadId, router]);

  // A server refresh is the source of truth (it drops messages an admin hid), but it can be a
  // moment older than what realtime already delivered — keep those newer messages on top.
  useEffect(
    () =>
      setMessages((prev) => {
        const known = new Set(initial.map((m) => m.id));
        const newest = Date.parse(initial.at(-1)?.created_at ?? "") || 0;
        // Keep a live message if it's newer than the snapshot (or its timestamp can't be parsed).
        return [...initial, ...prev.filter((m) => !known.has(m.id) && !(Date.parse(m.created_at) <= newest))];
      }),
    [initial],
  );

  // Stick to the newest message.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  // The composer grows with what's typed, up to a few lines.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body, terms]);

  // Live updates for this conversation (RLS ensures only participants receive them).
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`thread:${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` }, (payload) => {
        const m = payload.new as Msg & { hidden_at: string | null };
        if (m.hidden_at) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.sender_id !== me) void markThreadRead(threadId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadId, me]);

  const violation = body ? messageViolation(body, me === tutorId ? "tutor" : "family") : null;
  const send = (payload: { template?: string; body?: string }) => {
    const text = payload.template ? (templates.find((t) => t.key === payload.template)?.body ?? "") : (payload.body ?? "").trim();
    if (!text) return;
    setError(null);
    // Cleared now (not when the server answers) so the box is ready for the next message.
    if (payload.body) setBody("");
    if (payload.template && terms) setTray(false);
    start(async () => {
      addSending({ id: `sending-${Date.now()}`, sender_id: me, kind: payload.template ? "template" : "custom", body: text, created_at: new Date().toISOString(), sending: true });
      const res = await sendMessage({ threadId, ...payload });
      if (res && !res.ok) {
        setError(res.error.message);
        if (payload.body) setBody(payload.body);
      }
    });
  };
  const talked = shown.some((m) => m.kind !== "system");

  let lastDay = "";
  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-paper/50 px-3 py-4 sm:px-6" aria-live="polite" aria-relevant="additions">
        <div className="mx-auto max-w-2xl">
          <p className="mx-auto mb-4 flex max-w-md items-center justify-center gap-1.5 text-center text-[11.5px] leading-snug text-muted">
            <ShieldCheck className="size-3.5 shrink-0 text-pine-700" aria-hidden />
            {studentAccount ? "Your parent can read these messages." : "The student’s parent can read these messages."} Contact info and links are blocked.
          </p>
          {shown.map((m, i) => {
            const day = dayHeading(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.sender_id === me;
            const prev = shown[i - 1];
            const next = shown[i + 1];
            const t = Date.parse(m.created_at);
            const joinsPrev = !showDay && prev && prev.kind !== "system" && prev.sender_id === m.sender_id && t - Date.parse(prev.created_at) < GROUP_MS;
            const joinsNext =
              next && next.kind !== "system" && next.sender_id === m.sender_id && Date.parse(next.created_at) - t < GROUP_MS && dayHeading(next.created_at) === day;
            return (
              <div key={m.id} className={cn(joinsPrev ? "mt-0.5" : "mt-3")}>
                {showDay && (
                  <div className="my-4 flex items-center gap-3" role="separator">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">{day}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                {m.kind === "system" ? (
                  <div className="mx-auto flex max-w-md items-start gap-2 rounded-xl bg-paper-2/70 px-3 py-2 text-[12px] leading-snug text-ink-2 sm:text-[12.5px]">
                    <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-pine-700" aria-hidden />
                    <span className="flex-1">{m.body}</span>
                    <span className="shrink-0 text-[10px] text-faint">{formatTime(m.created_at)}</span>
                  </div>
                ) : (
                  <div className={cn("group flex items-end gap-1.5", mine ? "justify-end" : "justify-start")}>
                    {!mine && m.sender_id === otherId && (
                      <Link
                        href={`/dashboard/report?message=${m.id}&tutor=${tutorId}&student=${studentId}`}
                        className="order-2 mb-1 rounded-full p-1 text-faint opacity-0 transition hover:text-clay-700 focus:opacity-100 group-hover:opacity-100"
                        aria-label="Report this message"
                        title="Report this message"
                      >
                        <Flag className="size-3.5" />
                      </Link>
                    )}
                    <div
                      className={cn(
                        "max-w-[82%] px-3.5 py-2 text-[14.5px] leading-relaxed sm:max-w-[75%]",
                        mine ? "bg-pine-700 text-white" : "bg-card text-ink ring-1 ring-line",
                        "rounded-2xl",
                        mine ? joinsNext && "rounded-br-md" : joinsNext && "rounded-bl-md",
                        mine ? joinsPrev && "rounded-tr-md" : joinsPrev && "rounded-tl-md",
                        !joinsNext && (mine ? "rounded-br-md" : "rounded-bl-md"),
                        m.sending && "opacity-70",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      {!joinsNext && (
                        <p className={cn("mt-0.5 text-right text-[10.5px]", mine ? "text-white/65" : "text-faint")}>
                          {m.sending ? "Sending…" : formatTime(m.created_at)}
                          {m.kind === "template" && !m.sending && " · quick reply"}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!talked && !paused && (
            <p className="mt-6 text-center text-[13px] text-muted">
              No messages yet. {terms ? `Say hi to ${otherName.split(" ")[0]} below.` : "Tap a quick reply below to start."}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-5">
        {paused ? (
          <Notice tone="warning">Messaging is paused for this conversation.</Notice>
        ) : (
          <div className="mx-auto max-w-2xl">
            {tray && templates.length > 0 && (
              <div className="mb-2.5">
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Quick replies · tap to send</p>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {templates.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      disabled={pending}
                      title={t.body}
                      onClick={() => send({ template: t.key })}
                      className="shrink-0 rounded-full border border-line-2 bg-paper/60 px-3 py-1.5 text-[13px] text-ink-2 transition hover:border-pine-600 hover:bg-pine-50 hover:text-pine-800 disabled:opacity-50"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {terms ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!violation) send({ body });
                }}
                className="flex items-end gap-2"
              >
                {templates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTray(!tray)}
                    aria-expanded={tray}
                    aria-label={tray ? "Hide quick replies" : "Show quick replies"}
                    title="Quick replies"
                    className={cn(
                      "mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full transition",
                      tray ? "bg-brass-100 text-brass-800" : "text-muted hover:bg-paper-2 hover:text-ink",
                    )}
                  >
                    <Zap className="size-[18px]" aria-hidden />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <label htmlFor="composer" className="sr-only">
                    Message {otherName}
                  </label>
                  <textarea
                    id="composer"
                    ref={input}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (!violation) send({ body });
                      }
                    }}
                    maxLength={MESSAGE_MAX}
                    rows={1}
                    placeholder={`Message ${otherName.split(" ")[0]}…`}
                    aria-invalid={Boolean(violation)}
                    aria-describedby="composer-hint"
                    className="block max-h-40 min-h-11 w-full resize-none rounded-3xl border border-line-2 bg-paper/40 px-4 py-2.5 text-[15px] leading-snug focus:border-ink/40 focus:bg-card focus:outline-none focus:ring-4 focus:ring-glow/50 aria-[invalid=true]:border-clay-500"
                  />
                </div>
                <Button type="submit" className="mb-0.5 size-10 shrink-0 px-0" disabled={!body.trim() || Boolean(violation)} aria-label="Send">
                  <SendHorizontal className="size-4" aria-hidden />
                </Button>
              </form>
            ) : (
              <details className="group rounded-2xl border border-line bg-paper/60 open:bg-card">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-ink-2">
                  <Lock className="size-3.5 text-muted" aria-hidden /> Want to type your own messages?
                  <ChevronDown className="ml-auto size-4 text-muted transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-[13px] leading-relaxed text-muted">
                    Agree to keep messages about lessons, never share contact info or social accounts, never mention payment, and never suggest meeting in person.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <Checkbox
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      label={
                        <>
                          I agree to the{" "}
                          <Link href="/legal/messaging" target="_blank" className="underline underline-offset-2">
                            Messaging Guidelines
                          </Link>
                        </>
                      }
                    />
                    <Button
                      size="sm"
                      disabled={!agree}
                      pending={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await acceptMessagingTerms();
                          if (r?.ok) {
                            setTerms(true);
                            setTray(false);
                          } else if (r) setError(r.error.message);
                        })
                      }
                    >
                      Turn on typing
                    </Button>
                  </div>
                </div>
              </details>
            )}
            {terms && (
              <p id="composer-hint" className={cn("mt-1 flex justify-between px-1 text-[11px]", violation ? "text-clay-700" : "text-faint")}>
                <span>{violation ? `Messages can’t include ${violation}.` : coarse ? "" : "Enter to send · Shift+Enter for a new line"}</span>
                {body.length > MESSAGE_MAX * 0.8 && (
                  <span>
                    {body.length}/{MESSAGE_MAX}
                  </span>
                )}
              </p>
            )}
            {error && (
              <Notice tone="danger" className="mt-2">
                {error}
              </Notice>
            )}
          </div>
        )}
      </div>
    </>
  );
}
