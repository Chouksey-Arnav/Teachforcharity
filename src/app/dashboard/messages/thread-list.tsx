"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import type { MyThread } from "@/lib/data";
import { Avatar } from "@/components/ui/avatar";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/cn";

/** Search appears once there are enough conversations to need it. */
const SEARCH_FROM = 5;

export function ThreadList({ threads, selfManaged = [], studentAccount = false }: { threads: MyThread[]; selfManaged?: string[]; studentAccount?: boolean }) {
  const pathname = usePathname();
  const inThread = pathname !== "/dashboard/messages";
  const [q, setQ] = useState("");
  const unread = threads.filter((t) => t.unread).length;

  const rows = threads.map((t) => {
    const self = selfManaged.includes(t.student_id);
    return {
      t,
      title: t.my_side === "family" ? t.tutor_name : self ? t.student_name : `${t.student_name}’s family`,
      sub: t.my_side === "family" ? (studentAccount ? "Your tutor" : `Tutor for ${t.student_name}`) : self ? "Student account" : `Parent: ${t.family_name}`,
    };
  });
  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter((r) => `${r.title} ${r.sub} ${r.t.last_body ?? ""}`.toLowerCase().includes(term)) : rows;

  return (
    <aside className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", inThread ? "hidden" : "flex")} aria-label="Conversations">
      <div className="border-b border-line px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="display text-3xl">Messages</h1>
          {unread > 0 && <span className="rounded-full bg-brass-100 px-2 py-0.5 text-[11px] font-semibold text-brass-800">{unread} new</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted">{studentAccount ? "Your parent can read every message." : "Every conversation is visible to the parent."}</p>
        {threads.length >= SEARCH_FROM && (
          <label className="relative mt-3 block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-full border border-line-2 bg-paper/60 pl-9 pr-3 text-[14px] focus:border-ink/40 focus:bg-card focus:outline-none focus:ring-4 focus:ring-glow/50"
            />
          </label>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 && (
          <li className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-paper-2 text-pine-700">
              <MessageCircle className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-medium">No conversations yet</p>
            <p className="mt-1 max-w-[16rem] text-[13px] text-muted">
              {studentAccount ? "Open a tutor’s profile and tap “Message” to say hi, or book a lesson." : "They start when a lesson is requested or someone says hello."}
            </p>
            {studentAccount && (
              <Link href="/dashboard/tutors" className="mt-4 inline-flex h-9 items-center rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-4 text-[13px] font-semibold text-cream">
                Find a tutor
              </Link>
            )}
          </li>
        )}
        {threads.length > 0 && shown.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">No conversations match “{q}”.</li>}
        {shown.map(({ t, title, sub }) => {
          const active = pathname === `/dashboard/messages/${t.id}`;
          return (
            <li key={t.id}>
              <Link
                href={`/dashboard/messages/${t.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex gap-3 border-b border-line px-4 py-3.5 transition sm:px-5",
                  active ? "bg-pine-50/70 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-pine-700" : "hover:bg-paper/70",
                )}
              >
                <Avatar name={t.my_side === "family" ? t.tutor_name : t.student_name} path={t.my_side === "family" ? t.tutor_avatar : null} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-[14.5px]", t.unread ? "font-semibold" : "font-medium")}>{title}</p>
                    {t.last_message_at && <span className={cn("shrink-0 text-[11px]", t.unread ? "font-semibold text-brass-800" : "text-faint")}>{formatRelative(t.last_message_at)}</span>}
                  </div>
                  <p className="truncate text-xs text-muted">{sub}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className={cn("min-w-0 flex-1 truncate text-[13px]", t.unread ? "font-medium text-ink" : "text-muted")}>
                      {t.last_kind === "system" && <span className="text-faint">Update · </span>}
                      {t.last_body ?? "No messages yet — say hi"}
                    </p>
                    {t.unread && <span className="size-2.5 shrink-0 rounded-full bg-brass-500" aria-label="Unread" />}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
