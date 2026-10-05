import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CalendarPlus, UserRound } from "lucide-react";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { Conversation } from "./conversation";
import { PANE } from "./pane";
import { contactLabel, getMySessions, getStudentKinds } from "@/lib/data";
import { formatTime, formatWhen } from "@/lib/time";

export const metadata: Metadata = { title: "Conversation" };


export default async function ThreadPage({ params }: PageProps<"/dashboard/messages/[id]">) {
  const viewer = await requireViewer(["family", "tutor"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data: thread } = await supabase.from("threads").select("*").eq("id", id).maybeSingle();
  if (!thread) notFound();
  const side: "family" | "tutor" = thread.tutor_id === viewer.id ? "tutor" : "family";

  const [{ data: messages }, { data: templates }, config, threads, kinds, upcoming] = await Promise.all([
    supabase.from("messages").select("id, sender_id, kind, body, created_at").eq("thread_id", id).order("created_at", { ascending: true }).limit(300),
    supabase.from("message_templates").select("key, label, body, audience").in("audience", [side, "both"]).order("sort_order"),
    getPublicConfig(),
    supabase.rpc("my_threads"),
    side === "tutor" ? getStudentKinds(supabase) : Promise.resolve(new Map<string, "student" | "parent">()),
    getMySessions(supabase, "upcoming", 100),
  ]);
  await supabase.rpc("mark_thread_read", { p_thread: id });

  const meta = (threads.data ?? []).find((t) => t.id === id);
  const contact = contactLabel(meta?.student_name ?? "Student", kinds.get(thread.student_id), meta?.family_name);
  const studentAccount = viewer.profile.account_kind === "student";
  const title = side === "family" ? (meta?.tutor_name ?? "Tutor") : contact.title;
  const paused = meta?.tutor_status !== "active";
  const termsOk = viewer.profile.messaging_terms_version === config?.messaging_terms_version;
  const next = upcoming.find((s) => s.tutor_id === thread.tutor_id && s.student_id === thread.student_id && s.status === "scheduled");
  const pendingReq = upcoming.find((s) => s.tutor_id === thread.tutor_id && s.student_id === thread.student_id && s.status === "pending");
  const subtitle =
    side === "family" ? (studentAccount ? "Your tutor" : `Tutor for ${meta?.student_name ?? "your student"}`) : contact.sub;
  const profileHref = side === "family" ? `/dashboard/tutors/${thread.tutor_id}?student=${thread.student_id}` : `/dashboard/my-students/${thread.student_id}`;

  return (
    <div className={PANE}>
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5 sm:px-5">
        <Link href="/dashboard/messages" className="rounded-full p-2 text-muted hover:bg-paper-2 lg:hidden" aria-label="Back to messages">
          <ArrowLeft className="size-5" />
        </Link>
        <Link href={profileHref} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-0.5 pr-2 hover:bg-paper-2/60">
          <Avatar name={side === "family" ? title : (meta?.student_name ?? "S")} path={side === "family" ? meta?.tutor_avatar : null} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{title}</span>
            <span className="block truncate text-xs text-muted">{subtitle}</span>
          </span>
        </Link>
        <Link
          href={profileHref}
          className="hidden h-9 items-center gap-1.5 rounded-full border border-line-2 px-3.5 text-[13px] font-medium hover:border-ink/30 sm:inline-flex"
        >
          <UserRound className="size-4" aria-hidden /> Profile
        </Link>
        {side === "family" && (
          <Link
            href={`/dashboard/tutors/${thread.tutor_id}?student=${thread.student_id}#book`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-3.5 text-[13px] font-semibold text-cream"
          >
            <CalendarPlus className="size-4" aria-hidden /> Book<span className="hidden sm:inline"> a lesson</span>
          </Link>
        )}
      </header>
      {(next || pendingReq) && (
        <Link
          href={`/dashboard/lessons?focus=${(next ?? pendingReq)!.id}`}
          className="flex items-center gap-2 border-b border-line bg-pine-50/70 px-4 py-2 text-[13px] text-pine-800 hover:bg-pine-50 sm:px-5"
        >
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {next ? (
              <>
                Next lesson: <strong className="font-semibold">{formatWhen(next.start_at)}</strong> – {formatTime(next.end_at)} ET
              </>
            ) : (
              <>
                Request {pendingReq!.awaiting_me ? "waiting for you" : "pending"}: <strong className="font-semibold">{formatWhen(pendingReq!.start_at)}</strong>
              </>
            )}
          </span>
          <span className="shrink-0 font-medium underline-offset-2 hover:underline">View</span>
        </Link>
      )}
      <Conversation
        threadId={id}
        me={viewer.id}
        otherId={side === "family" ? thread.tutor_id : thread.family_id}
        otherName={title}
        tutorId={thread.tutor_id}
        studentId={thread.student_id}
        initial={messages ?? []}
        templates={templates ?? []}
        termsAccepted={termsOk}
        paused={paused}
        studentAccount={studentAccount}
      />
    </div>
  );
}
