import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MessageCircle, Users } from "lucide-react";
import { AdminPage, Empty, ago } from "@/components/admin/ui";
import { CommunicationsCompose } from "@/components/admin/communications-compose";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { communicationsDb } from "./data";

export const metadata: Metadata = { title: "Student communications" };
const PAGE_SIZE = 50;

type Search = { q?: string | string[]; page?: string | string[]; threadPage?: string | string[] };
function parsePage(value: string | string[] | undefined) {
  const n = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, Math.floor(2147483647 / PAGE_SIZE) + 1) : 1;
}
export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const page = parsePage(sp.page);
  const threadPage = parsePage(sp.threadPage);
  const db = await communicationsDb();
  const [studentsResult, threadsResult] = await Promise.all([db.students(q, PAGE_SIZE, (page - 1) * PAGE_SIZE), db.threads(PAGE_SIZE, (threadPage - 1) * PAGE_SIZE)]);
  const students = studentsResult.data ?? [];
  const threads = threadsResult.data ?? [];
  // An out-of-range page has no rows carrying the window count; fetch it separately.
  const [studentThreadsResult, threadCountResult] = await Promise.all([
    students.length ? db.studentThreads(students.map((student) => student.student_id)) : Promise.resolve(null),
    !threadsResult.error && !threads.length && threadPage > 1 ? db.threads(1, 0) : Promise.resolve(null),
  ]);
  const total = students[0] ? Number(students[0].total_count) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const threadTotal = Number((threads[0] ?? threadCountResult?.data?.[0])?.total_count ?? 0);
  const threadPages = Math.max(1, Math.ceil(threadTotal / PAGE_SIZE));
  const threadError = threadsResult.error || threadCountResult?.error;
  const href = (studentPage: number, conversationPage: number, search = q) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (studentPage > 1) params.set("page", String(studentPage));
    if (conversationPage > 1) params.set("threadPage", String(conversationPage));
    return `/admin/communications${params.size ? `?${params}` : ""}`;
  };

  return (
    <AdminPage title={<>Student <em>communications</em></>} description="Stay in touch with students’ families, one conversation at a time.">
      <div className="mb-6 rounded-[28px] border border-line bg-card p-5 shadow-card sm:p-6">
        <p className="eyebrow">A note about this workspace</p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">Messages go to the student’s family account in Teach for a Cause. A student-owned family account can receive messages with guardian visibility. This is not email; the <Link href="/admin/inbox" className="font-semibold underline underline-offset-4">contact inbox</Link> is a separate workspace for website inquiries.</p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="directory-title" className="min-w-0 rounded-[28px] border border-line bg-card p-5 shadow-card sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><p className="eyebrow">01 / Find a student</p><h2 id="directory-title" className="display mt-1 text-3xl">Student <em>directory</em></h2><p className="mt-1 text-sm text-muted">Search students, then message their family account.</p></div>
            <span className="rounded-2xl bg-mint p-3 text-pine-800"><Users className="size-5" aria-hidden /></span>
          </div>
          <form action="/admin/communications" className="mt-5 flex gap-2" role="search">
            <label htmlFor="student-search" className="sr-only">Search students and families</label>
            {threadPage > 1 && <input type="hidden" name="threadPage" value={threadPage} />}
            <Input id="student-search" name="q" defaultValue={q} placeholder="Search students or families" className="min-w-0 flex-1" />
            <Button type="submit">Search</Button>
          </form>
          {q && <Link href={href(1, threadPage, "")} className="mt-2 inline-block text-sm font-semibold text-ink underline underline-offset-4">Clear search</Link>}
          <div className="mt-5">
            {studentThreadsResult?.error && <Notice tone="danger">Could not load recent conversation links for these students.</Notice>}
            {studentsResult.error ? <Notice tone="danger">Could not load the student directory. Please try again.</Notice> : students.length === 0 ? <Empty>{page > 1 ? "No students on this page. Go back to the previous page." : q ? "No students match your search." : "No students in the directory yet."}</Empty> : <>
              <p className="mb-3 text-xs text-muted">{total} {total === 1 ? "student" : "students"} · showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + students.length}</p>
              <ul className="divide-y divide-line">
                {students.map((student) => <li key={student.student_id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="font-semibold text-ink">{student.student_name || "Unnamed student"}</h3>
                      <p className="mt-1 text-sm text-ink-2">Family account: <Link href={`/admin/people/${student.family_id}`} className="font-semibold underline underline-offset-4">{student.family_name || "Unnamed family"} · view account and student profile</Link></p>
                      {student.family_email && <p className="break-all text-xs text-muted">{student.family_email}</p>}
                      <p className="mt-1 text-xs text-muted">{[student.grade != null ? `Grade ${student.grade}` : null, student.school].filter(Boolean).join(" · ") || "Grade and school not provided"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5"><Badge tone={student.is_active ? "pine" : "neutral"}>{student.is_active ? "Active" : "Inactive"}</Badge><Badge tone={student.consent_ok ? "pine" : "brass"}>{student.consent_ok ? "Eligible for messaging" : "Not eligible for messaging"}</Badge></div>
                  </div>
                  <div className="mt-3">{student.is_active && student.consent_ok ? <CommunicationsCompose studentId={student.student_id} studentName={student.student_name || "this student"} collapsible /> : <><Button type="button" size="sm" variant="secondary" disabled>Message family</Button><p className="mt-2 text-sm text-muted">Messaging is unavailable{!student.is_active ? " because this student is inactive" : " because consent or other messaging requirements are not met"}. Check the account and student profile for details.</p></>}</div>
                  {(studentThreadsResult?.data ?? []).filter((thread) => thread.student_id === student.student_id).map((thread) => <p key={thread.thread_id} className="mt-2 text-sm"><Link href={`/admin/communications/${thread.thread_id}`} className="font-semibold underline underline-offset-4">Open recent conversation with {thread.family_name || "unnamed family"}</Link></p>)}
                </li>)}
              </ul>
            </>}
          </div>
          {!studentsResult.error && (page > 1 || page < pages) && <nav aria-label="Student directory pages" className="mt-5 flex flex-wrap items-center gap-3">
            {page > 1 && <LinkButton href={href(page - 1, threadPage)} variant="secondary" size="sm">Previous</LinkButton>}
            <span className="text-sm text-muted">{students.length ? `Page ${page} of ${pages}` : `Page ${page}`}</span>
            {page < pages && <LinkButton href={href(page + 1, threadPage)} variant="secondary" size="sm">Next</LinkButton>}
          </nav>}
        </section>
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="threads-title" className="rounded-[28px] border border-line bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">02 / Conversations</p><h2 id="threads-title" className="display mt-1 text-3xl">Recent <em>messages</em></h2><p className="mt-1 text-sm text-muted">Open a conversation to read and reply. Browse all conversations, ordered by most recent message.</p></div><span className="rounded-2xl bg-lilac p-3 text-sky-700"><MessageCircle className="size-5" aria-hidden /></span></div>
            <div className="mt-5">{threadError ? <Notice tone="danger">Could not load conversations. Please try again.</Notice> : !threads.length ? <Empty>{threadTotal ? "No conversations on this page. Go back to an earlier page." : "No family conversations yet. Start one from the student directory."}</Empty> : <><p className="mb-3 text-xs text-muted">{threadTotal} {threadTotal === 1 ? "conversation" : "conversations"} · showing {(threadPage - 1) * PAGE_SIZE + 1}–{(threadPage - 1) * PAGE_SIZE + threads.length}</p><ul className="divide-y divide-line">{threads.map((thread) => <li key={thread.thread_id}><Link href={`/admin/communications/${thread.thread_id}`} className="group flex items-start gap-3 py-4 first:pt-0 hover:text-pine-800"><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{thread.student_name || "Unnamed student"}</span>{thread.unread_admin && <Badge tone="brass" dot>Unread</Badge>}</span><span className="mt-0.5 block text-xs text-muted">Family: {thread.family_name || "Unnamed family"} · {ago(thread.last_message_at)}</span><span className="mt-1 block truncate text-sm text-ink-2">{thread.last_body || "No message preview"}</span></span><ArrowUpRight className="mt-1 size-4 shrink-0 text-muted group-hover:text-ink" aria-hidden /></Link></li>)}</ul></>}</div>
            {!threadError && (threadPage > 1 || threadPage < threadPages) && <nav aria-label="Conversation pages" className="mt-5 flex flex-wrap items-center gap-3">
              {threadPage > 1 && <LinkButton href={href(page, threadPage - 1)} variant="secondary" size="sm">Previous</LinkButton>}
              <span className="text-sm text-muted">Page {threadPage} of {threadPages} · {threadTotal} {threadTotal === 1 ? "conversation" : "conversations"}</span>
              {threadPage > threadPages && <LinkButton href={href(page, threadPages)} variant="secondary" size="sm">Last page</LinkButton>}
              {threadPage < threadPages && <LinkButton href={href(page, threadPage + 1)} variant="secondary" size="sm">Next</LinkButton>}
            </nav>}
          </section>
          <section aria-labelledby="broadcast-title" className="rounded-[28px] border border-line bg-card p-5 shadow-card sm:p-6">
            <p className="eyebrow">03 / Reach families</p><h2 id="broadcast-title" className="display mt-1 text-3xl">Send a <em>broadcast</em></h2>
            <p className="mb-4 mt-1 text-sm text-muted">Share an update with eligible families. You’ll review and confirm before sending.</p>
            <CommunicationsCompose broadcast />
          </section>
        </div>
      </div>
    </AdminPage>
  );
}
