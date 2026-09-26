import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { Conversation } from "./conversation";
import { contactLabel, getStudentKinds } from "@/lib/data";

export const metadata: Metadata = { title: "Conversation" };

export default async function ThreadPage({ params }: PageProps<"/dashboard/messages/[id]">) {
  const viewer = await requireViewer(["family", "tutor"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: thread } = await supabase.from("threads").select("*").eq("id", id).maybeSingle();
  if (!thread) notFound();
  const side: "family" | "tutor" = thread.tutor_id === viewer.id ? "tutor" : "family";

  const [{ data: messages }, { data: templates }, config, threads, kinds] = await Promise.all([
    supabase.from("messages").select("id, sender_id, kind, body, created_at").eq("thread_id", id).order("created_at", { ascending: true }).limit(300),
    supabase.from("message_templates").select("key, label, body, audience").in("audience", [side, "both"]).order("sort_order"),
    getPublicConfig(),
    supabase.rpc("my_threads"),
    side === "tutor" ? getStudentKinds(supabase) : Promise.resolve(new Map<string, "student" | "parent">()),
  ]);
  await supabase.rpc("mark_thread_read", { p_thread: id });

  const meta = (threads.data ?? []).find((t) => t.id === id);
  const contact = contactLabel(meta?.student_name ?? "Student", kinds.get(thread.student_id), meta?.family_name);
  const studentAccount = viewer.profile.account_kind === "student";
  const title = side === "family" ? (meta?.tutor_name ?? "Tutor") : contact.title;
  const subtitle = side === "family" ? (studentAccount ? "Your tutor · your parent can read these messages" : `Tutor for ${meta?.student_name ?? "your student"}`) : contact.sub;
  const paused = meta?.tutor_status !== "active";
  const termsOk = viewer.profile.messaging_terms_version === config?.messaging_terms_version;

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-0 flex-col lg:h-full">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <Link href="/dashboard/messages" className="-ml-1 rounded-full p-1.5 text-muted hover:bg-paper-2 lg:hidden" aria-label="Back to messages">
          <ArrowLeft className="size-5" />
        </Link>
        <Avatar name={side === "family" ? title : (meta?.student_name ?? "S")} path={side === "family" ? meta?.tutor_avatar : null} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        {side === "tutor" && (
          <Link href={`/dashboard/my-students/${thread.student_id}`} className="rounded-full border border-line-2 px-3 py-1.5 text-xs font-medium hover:border-ink/30">
            Student profile
          </Link>
        )}
        {side === "family" && (
          <Link href={`/dashboard/tutors/${thread.tutor_id}?student=${thread.student_id}`} className="rounded-full border border-line-2 px-3 py-1.5 text-xs font-medium hover:border-ink/30">
            Request a lesson
          </Link>
        )}
      </header>
      <Conversation
        threadId={id}
        me={viewer.id}
        otherId={side === "family" ? thread.tutor_id : thread.family_id}
        tutorId={thread.tutor_id}
        studentId={thread.student_id}
        initial={messages ?? []}
        templates={templates ?? []}
        termsAccepted={termsOk}
        paused={paused}
      />
    </div>
  );
}
