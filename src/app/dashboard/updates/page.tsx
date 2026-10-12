import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck, Mail } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyUpdates } from "@/lib/data";
import { AREA_LABEL, dayBucket, isArea, type UpdateArea, type UpdateItem } from "@/lib/updates";
import { markAllUpdatesRead } from "@/app/actions/updates";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpdateList } from "@/components/dashboard/update-row";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Updates" };

const ORDER: UpdateArea[] = ["messages", "lessons", "practice", "hours", "account"];

export default async function UpdatesPage({ searchParams }: PageProps<"/dashboard/updates">) {
  const viewer = await requireViewer(["family", "tutor"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const all = await getMyUpdates(supabase, { role: viewer.role, isStudent: viewer.profile.account_kind === "student" }, 150);

  const show = isArea(sp.show) ? sp.show : null;
  const items = show ? all.filter((u) => u.area === show) : all;
  const unread = items.filter((u) => u.unread);
  const seen = items.filter((u) => !u.unread);
  const totalUnread = all.filter((u) => u.unread).length;

  // Only offer filters for kinds of updates this person actually has.
  const areas = ORDER.filter((a) => all.some((u) => u.area === a));
  const chips = [
    { key: null, label: "Everything", unread: totalUnread },
    ...areas.map((a) => ({ key: a, label: AREA_LABEL[a], unread: all.filter((u) => u.area === a && u.unread).length })),
  ];

  // Seen updates, grouped by day.
  const groups = new Map<string, UpdateItem[]>();
  for (const u of seen) {
    const k = dayBucket(u.updatedAt);
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Updates"
        title={
          <>
            What’s <em>new</em>
          </>
        }
        description={
          totalUnread
            ? `You have ${totalUnread} new ${totalUnread === 1 ? "update" : "updates"}. Tap one to open it.`
            : "Every message, lesson change and note, in one place. Tap any of them to open it."
        }
        actions={
          unread.length > 0 ? (
            <form action={markAllUpdatesRead}>
              {show && <input type="hidden" name="area" value={show} />}
              <Button variant="secondary" size="sm">
                <CheckCheck className="size-4" /> Mark all as read
              </Button>
            </form>
          ) : undefined
        }
      />

      {areas.length > 1 && (
        <nav aria-label="Show" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {chips.map((c) => {
            const active = show === c.key;
            return (
              <Link
                key={c.key ?? "all"}
                href={c.key ? `/dashboard/updates?show=${c.key}` : "/dashboard/updates"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] active:scale-[0.97]",
                  active ? "bg-ink text-cream" : "border border-ink/12 bg-white/70 text-ink-2 hover:-translate-y-px hover:bg-white",
                )}
              >
                {c.label}
                {c.unread > 0 && (
                  <span className={cn("min-w-5 rounded-full px-1.5 py-0.5 text-center font-mono text-[10.5px] leading-none", active ? "bg-glow text-ink" : "bg-brass-100 text-brass-800")}>
                    {c.unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {items.length === 0 ? (
        <Empty icon={<Bell className="size-5" />} title={show ? `No ${AREA_LABEL[show].toLowerCase()} updates yet` : "You’re all caught up"}>
          {viewer.role === "tutor"
            ? "When a student messages you, requests a lesson, or confirms one, it shows up here."
            : "When your tutor messages you, a lesson is booked or changes, or there’s new practice, it shows up here."}
        </Empty>
      ) : (
        <div className="grid gap-8">
          {unread.length > 0 && (
            <section aria-labelledby="updates-new" className="animate-rise">
              <h2 id="updates-new" className="eyebrow mb-3">
                New · {unread.length}
              </h2>
              <UpdateList items={unread} />
            </section>
          )}
          {unread.length === 0 && (
            <p className="flex items-center gap-2 rounded-2xl border border-pine-700/15 bg-mint/30 px-4 py-3 text-[14px] text-pine-800">
              <CheckCheck className="size-4 shrink-0" /> You’ve seen everything. Nice.
            </p>
          )}
          {[...groups].map(([label, list]) => (
            <section key={label} aria-label={label}>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{label}</h2>
              <UpdateList items={list} />
            </section>
          ))}
        </div>
      )}

      <aside className="mt-10 flex gap-3 rounded-2xl border border-line bg-white/60 p-5 text-[14px] leading-relaxed text-ink-2">
        <Mail className="mt-0.5 size-5 shrink-0 text-pine-700" />
        <div>
          <p className="font-semibold text-ink">When do we email you?</p>
          <p className="mt-1">
            Lesson bookings, changes and reminders are always emailed. For messages, we only email when it’s worth it: when 3 or more are waiting,
            when one has waited 6 hours, or right away if it’s about a lesson happening soon. Never while you’re already chatting, and not at night
            unless it’s urgent.{" "}
            <Link href="/dashboard/profile" className="font-medium text-pine-700 underline decoration-pine-700/30 underline-offset-4 hover:decoration-pine-700">
              Email settings
            </Link>
          </p>
        </div>
      </aside>
    </>
  );
}
