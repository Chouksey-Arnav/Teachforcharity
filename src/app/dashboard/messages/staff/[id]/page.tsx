import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/viewer";
import { formatWhen } from "@/lib/time";
import { PANE } from "../../[id]/pane";
import { Reply } from "./reply";

export default async function StaffConversation({ params }: { params: Promise<{ id: string }> }) {
  await requireViewer(["family"]);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [{ data: threads, error: listError }, { data: messages, error }] = await Promise.all([
    supabase.rpc("family_comms_threads"), supabase.rpc("family_comms_messages", { p_thread: id }),
  ]);
  const thread = threads?.find((t) => t.thread_id === id);
  if (error || listError || !thread || !messages) notFound();
  await supabase.rpc("family_comms_mark_read", { p_thread: id });
  return (
    <div className={PANE}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link href="/dashboard/messages" className="rounded-full p-2 text-muted hover:bg-paper-2 lg:hidden" aria-label="Back to messages"><ArrowLeft className="size-5" /></Link>
        <div><h1 className="font-semibold">Teach for a Cause</h1><p className="text-xs text-muted">About {thread.student_name}</p></div>
      </header>
      <div role="log" aria-label="Messages from Teach for a Cause" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto bg-paper/50 p-4">
        <p className="mb-4 text-center text-xs text-muted">This conversation is separate from tutor messages. Please keep contact on Teach for a Cause.</p>
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.map((message) => <div key={message.id} className={`flex ${message.sender_side === "family" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${message.sender_side === "family" ? "bg-pine-700 text-white" : "bg-card text-ink ring-1 ring-line"}`}>
              <p className="text-xs font-semibold">{message.sender_name}</p><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
              <p className="mt-1 text-xs opacity-70">{formatWhen(message.created_at)}</p>
            </div>
          </div>)}
        </div>
      </div>
      <Reply threadId={id} />
    </div>
  );
}
