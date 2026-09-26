"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Activity, CalendarDays, Gauge, Mail, MessagesSquare, Settings, ShieldAlert, Siren, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/lessons", label: "Lessons", icon: CalendarDays },
  { href: "/admin/reports", label: "Reports", icon: Siren, badge: "reports" },
  { href: "/admin/safety", label: "Safety scan", icon: ShieldAlert, badge: "flags" },
  { href: "/admin/messages", label: "Messages", icon: MessagesSquare },
  { href: "/admin/activity", label: "Activity log", icon: Activity },
  { href: "/admin/emails", label: "Emails", icon: Mail },
  { href: "/admin/settings", label: "Settings & health", icon: Settings },
] as const;

export function AdminNav({ counts, variant }: { counts: { reports: number; flags: number }; variant: "side" | "top" }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  if (variant === "top")
    return (
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2" aria-label="Admin">
        {ITEMS.map((i) => {
          const n = "badge" in i ? counts[i.badge] : 0;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]", isActive(i.href, "exact" in i) ? "bg-ink text-white" : "text-ink-2 ring-1 ring-line")}
            >
              {i.label}
              {n > 0 && <span className="rounded-full bg-clay-700 px-1.5 text-[10px] font-semibold text-white">{n}</span>}
            </Link>
          );
        })}
      </nav>
    );
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Admin">
      {ITEMS.map((i) => {
        const Icon = i.icon;
        const active = isActive(i.href, "exact" in i);
        const n = "badge" in i ? counts[i.badge] : 0;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", active ? "bg-card font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-paper-2")}
          >
            <Icon className={cn("size-4", active ? "text-pine-700" : "text-muted")} strokeWidth={1.9} />
            <span className="flex-1">{i.label}</span>
            {n > 0 && <span className="rounded-full bg-clay-700 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white">{n > 99 ? "99+" : n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Keeps every admin page in sync with the database: refreshes every 30s and when the tab regains focus. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [router, seconds]);
  return null;
}
