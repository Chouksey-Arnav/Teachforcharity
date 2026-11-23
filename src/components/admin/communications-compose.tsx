"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { replyAdminCommunication, sendAdminCommunication } from "@/app/actions/admin-communications";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

/** Used for a student, a thread reply, or an explicitly confirmed broadcast. */
export function CommunicationsCompose({ studentId, studentName, threadId, broadcast = false, collapsible = false }: {
  studentId?: string;
  studentName?: string;
  threadId?: string;
  broadcast?: boolean;
  collapsible?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!collapsible);
  const [body, setBody] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const id = broadcast ? "broadcast-message" : `message-${studentId}`;

  async function send() {
    if (pending || !body.trim() || (broadcast && !confirmed)) return;
    setPending(true);
    setFeedback(null);
    try {
      const result = threadId
        ? await replyAdminCommunication(threadId, body.trim())
        : await sendAdminCommunication({ studentId, all: broadcast, body: body.trim() });
      if (!result?.ok) {
        setFeedback({ ok: false, message: result?.error.message ?? "The message could not be sent. Please try again." });
      } else {
        setBody("");
        setReviewing(false);
        setConfirmed(false);
        setFeedback({ ok: true, message: result.message || (broadcast ? "Broadcast sent as individual messages." : "Message sent to the family account.") });
        router.refresh();
      }
    } catch {
      setFeedback({ ok: false, message: "The message could not be sent. Please try again." });
    } finally {
      setPending(false);
    }
  }

  if (!open) return <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>Message family</Button>;

  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (broadcast && !reviewing) { setFeedback(null); setReviewing(true); } else void send(); }}>
      <Field htmlFor={id} label={broadcast ? "Broadcast message" : `Message${studentName ? ` about ${studentName}` : ""}`} hint={broadcast ? "Sent to family accounts as separate individual messages, not a group conversation." : "This message goes to the student's family account. Student-owned accounts can receive messages with guardian visibility."}>
        <Textarea id={id} value={body} onChange={(event) => setBody(event.target.value)} disabled={pending || reviewing} required maxLength={800} placeholder="Write your message…" rows={3} />
      </Field>
      {reviewing && (
        <div className="space-y-3 rounded-2xl border border-brass-600/30 bg-brass-50 p-4">
          <p className="text-sm font-semibold text-ink">Confirm broadcast</p>
          <p className="text-sm text-ink-2">This will send the message to eligible students’ family accounts as separate individual messages. It is not limited to the current search or page.</p>
          <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} label="I understand and want to send this broadcast." />
        </div>
      )}
      {feedback && <Notice tone={feedback.ok ? "success" : "danger"}>{feedback.message}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" pending={pending} disabled={!body.trim() || (reviewing && !confirmed)}>{pending ? "Sending…" : reviewing ? "Send broadcast" : broadcast ? "Review broadcast" : "Send message"}</Button>
        {reviewing && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setReviewing(false); setConfirmed(false); }}>Edit message</Button>}
        {collapsible && !reviewing && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setOpen(false); setFeedback(null); }}>Close</Button>}
      </div>
    </form>
  );
}
