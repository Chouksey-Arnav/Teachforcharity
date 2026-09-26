"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MyThread } from "@/lib/data";
import { Avatar } from "@/components/ui/avatar";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/cn";

export function ThreadList({ threads }: { threads: MyThread[] }) {
  const pathname = usePathname();
  const inThread = pathname !== "/dashboard/messages";
  return (
    <aside className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", inThread ? "hidden" : "flex")}>
      <div className="border-b border-line px-5 py-4">
        <h1 className="display text-3xl">Messages</h1>
        <p className="text-xs text-muted">Every conversation is visible to the parent account.</p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 && <li className="px-5 py-8 text-sm text-muted">No conversations yet. They start when a lesson is requested or someone says hello.</li>}
        {threads.map((t) => {
          const active = pathname === `/dashboard/messages/${t.id}`;
          const title = t.my_side === "family" ? t.tutor_name : `${t.student_name}’s family`;
          const sub = t.my_side === "family" ? `for ${t.student_name}` : `Parent: ${t.family_name}`;
          return (
            <li key={t.id}>
              <Link
                href={`/dashboard/messages/${t.id}`}
                className={cn("flex gap-3 border-b border-line px-5 py-4 transition", active ? "bg-pine-50/60" : "hover:bg-paper/70")}
              >
                <Avatar name={t.my_side === "family" ? t.tutor_name : t.student_name} path={t.my_side === "family" ? t.tutor_avatar : null} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{title}</p>
                    {t.last_message_at && <span className="shrink-0 text-[11px] text-faint">{formatRelative(t.last_message_at)}</span>}
                  </div>
                  <p className="truncate text-xs text-muted">{sub}</p>
                  <p className={cn("mt-1 truncate text-[13px]", t.unread ? "text-ink" : "text-muted")}>
                    {t.last_kind === "system" && <span className="text-faint">Update · </span>}
                    {t.last_body ?? "No messages yet"}
                  </p>
                </div>
                {t.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brass-500" aria-label="Unread" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
