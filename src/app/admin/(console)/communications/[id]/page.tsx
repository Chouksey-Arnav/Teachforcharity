import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Empty, when } from "@/components/admin/ui";
import { CommunicationsCompose } from "@/components/admin/communications-compose";
import { CommunicationsRead } from "@/components/admin/communications-read";
import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { communicationsDb } from "../data";

export const metadata: Metadata = { title: "Family conversation" };

export default async function CommunicationThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const db = await communicationsDb();
  const [threadResult, messagesResult] = await Promise.all([db.thread(id), db.messages(id)]);
  const thread = threadResult.data?.[0];
  return <div className="mx-auto max-w-4xl">
    <LinkButton href="/admin/communications" variant="ghost" size="sm"><ArrowLeft className="size-4" /> Student communications</LinkButton>
    {threadResult.error || messagesResult.error ? <Notice tone="danger" className="mt-5">Could not load this conversation. Please try again.</Notice> : !thread ? <div className="mt-5"><Empty>This conversation was not found.</Empty></div> : <>
      {thread.unread_admin && <div className="mt-4"><CommunicationsRead threadId={id} /></div>}
      <header className="mb-6 mt-5"><p className="eyebrow">Family conversation</p><h1 className="display mt-1 text-4xl">About <em>{thread.student_name || "this student"}</em></h1><p className="mt-2 text-sm text-muted">Family account: {thread.family_name || "Unnamed family"} · Messages stay in Teach for a Cause; this is not email.</p></header>
      <section aria-labelledby="conversation-title" className="rounded-[28px] border border-line bg-card p-5 shadow-card sm:p-6">
        <h2 id="conversation-title" className="display text-2xl">Conversation <em>history</em></h2>
        {!messagesResult.data?.length ? <div className="mt-4"><Empty>No messages in this conversation yet.</Empty></div> : <ol className="mt-5 space-y-3">{messagesResult.data.map((message) => <li key={message.id} className={`flex ${message.sender_side === "admin" ? "justify-end" : "justify-start"}`}><div className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm sm:max-w-[80%] ${message.sender_side === "admin" ? "bg-mint/55" : "bg-paper-2"}`}><p className="text-xs font-semibold text-ink-2">{message.sender_name || (message.sender_side === "admin" ? "Admin" : "Family")} <span className="font-normal text-muted">· {message.sender_side === "admin" ? "Admin" : "Family"}</span></p><p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{message.body}</p><p className="mt-2 text-xs text-muted">{when(message.created_at)} ET</p></div></li>)}</ol>}
        <div className="mt-6 border-t border-line pt-5"><h2 className="display mb-3 text-2xl">Quick <em>reply</em></h2>{thread.can_reply ? <CommunicationsCompose threadId={id} studentId={thread.student_id} studentName={thread.student_name || "this student"} /> : <Notice tone="info">Replying is unavailable because the student may no longer belong to this family account or is not currently eligible for messaging. Replies are turned off here to avoid sending to a different family after reassignment. Check the student directory for the current account and eligibility.</Notice>}</div>
      </section>
    </>}
  </div>;
}
