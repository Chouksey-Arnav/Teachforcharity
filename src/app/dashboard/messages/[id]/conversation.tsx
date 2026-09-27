"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Lock, SendHorizontal, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markThreadRead } from "@/app/actions/messages";
import { acceptMessagingTerms } from "@/app/actions/profile";
import { MESSAGE_MAX, messageViolation } from "@/lib/moderation";
import { formatDate, formatTime } from "@/lib/time";
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
}

export function Conversation({
  threadId,
  me,
  otherId,
  tutorId,
  studentId,
  initial,
  templates,
  termsAccepted,
  paused,
}: {
  threadId: string;
  me: string;
  otherId: string;
  tutorId: string;
  studentId: string;
  initial: Msg[];
  templates: { key: string; label: string; body: string }[];
  termsAccepted: boolean;
  paused: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(termsAccepted);
  const [agree, setAgree] = useState(false);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [messages.length]);

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

  const violation = body ? messageViolation(body) : null;
  const send = (payload: { template?: string; body?: string }) =>
    start(async () => {
      setError(null);
      const res = await sendMessage({ threadId, ...payload });
      if (res && !res.ok) return setError(res.error.message);
      if (payload.body) setBody("");
    });

  let lastDay = "";
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto bg-paper/50 px-4 py-5 sm:px-6" aria-live="polite">
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="mb-5 flex items-start gap-2 rounded-xl bg-card px-4 py-3 text-xs leading-relaxed text-muted ring-1 ring-line">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-pine-700" />
            Messages stay on this site and are visible to the student’s parent. Contact info, links, and outside apps are blocked. Admins may review messages for safety.
          </div>
          {messages.map((m) => {
            const day = formatDate(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.sender_id === me;
            return (
              <div key={m.id}>
                {showDay && <p className="py-3 text-center text-[11px] font-medium uppercase tracking-wider text-faint">{day}</p>}
                {m.kind === "system" ? (
                  <p className="mx-auto max-w-md rounded-full bg-paper-2 px-4 py-1.5 text-center text-xs text-muted">{m.body}</p>
                ) : (
                  <div className={cn("group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                    {!mine && m.sender_id === otherId && (
                      <Link
                        href={`/dashboard/report?message=${m.id}&tutor=${tutorId}&student=${studentId}`}
                        className="order-2 mb-1 rounded-full p-1 text-faint opacity-0 transition hover:text-clay-700 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Report this message"
                        title="Report this message"
                      >
                        <Flag className="size-3.5" />
                      </Link>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed",
                        mine ? "rounded-br-md bg-pine-700 text-white" : "rounded-bl-md bg-card text-ink ring-1 ring-line",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={cn("mt-1 text-[10.5px]", mine ? "text-white/60" : "text-faint")}>
                        {formatTime(m.created_at)}
                        {m.kind === "template" && " · quick reply"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-line bg-card px-4 pb-4 pt-3 sm:px-5">
        {paused ? (
          <Notice tone="warning">Messaging is paused for this conversation.</Notice>
        ) : (
          <>
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={pending}
                  title={t.body}
                  onClick={() => send({ template: t.key })}
                  className="shrink-0 rounded-full border border-line-2 bg-paper/60 px-3 py-1.5 text-[13px] text-ink-2 transition hover:border-pine-600 hover:text-pine-800 disabled:opacity-50"
                >
                  {t.label}
                </button>
              ))}
            </div>
            {terms ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!violation && body.trim()) send({ body });
                }}
                className="flex items-end gap-2"
              >
                <div className="flex-1">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!violation && body.trim()) send({ body });
                      }
                    }}
                    maxLength={MESSAGE_MAX}
                    rows={1}
                    placeholder="Write a message…"
                    aria-invalid={Boolean(violation)}
                    className="max-h-40 min-h-11 w-full resize-none rounded-2xl border border-line-2 bg-card px-4 py-2.5 text-[15px] focus:border-pine-600 focus:outline-none focus:ring-4 focus:ring-pine-600/10 aria-[invalid=true]:border-clay-500"
                  />
                  <div className="mt-1 flex justify-between px-1 text-[11px]">
                    <span className={violation ? "text-clay-700" : "text-faint"}>
                      {violation ? `Messages can’t include ${violation}.` : "Enter to send · Shift+Enter for a new line"}
                    </span>
                    <span className="text-faint">
                      {body.length}/{MESSAGE_MAX}
                    </span>
                  </div>
                </div>
                <Button type="submit" size="md" className="mb-5 size-11 px-0" pending={pending} disabled={!body.trim() || Boolean(violation)} aria-label="Send">
                  {!pending && <SendHorizontal className="size-4" />}
                </Button>
              </form>
            ) : (
              <div className="rounded-2xl border border-line bg-paper/60 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Lock className="size-4 text-muted" /> Want to write your own messages?
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Quick replies are always available. To write freely, agree to keep messages about lessons, never share contact info or social
                  accounts, never mention payment, and never suggest meeting in person.
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
                        if (r?.ok) setTerms(true);
                        else if (r) setError(r.error.message);
                      })
                    }
                  >
                    Enable writing
                  </Button>
                </div>
              </div>
            )}
            {error && (
              <Notice tone="danger" className="mt-3">
                {error}
              </Notice>
            )}
          </>
        )}
      </div>
    </>
  );
}
