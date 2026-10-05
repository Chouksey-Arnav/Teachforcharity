"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Activity, CalendarDays, Gauge, LogOut, Mail, Menu, MessagesSquare, PhoneCall, RotateCw, Search, Settings, ShieldAlert, Siren, Users, X } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { adminLogout } from "@/app/actions/admin";
import { cn } from "@/lib/cn";

type Counts = { reports: number; flags: number; calls: number };
type Item = { href: string; label: string; icon: typeof Gauge; exact?: boolean; badge?: keyof Counts; hint: string };

/** Grouped by the question an admin is asking: what's happening, who/what, is anyone unsafe, is the system OK. */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Program",
    items: [
      { href: "/admin", label: "Overview", icon: Gauge, exact: true, hint: "What needs attention right now" },
      { href: "/admin/people", label: "People", icon: Users, hint: "Students, parents, tutors, reviewers" },
      { href: "/admin/lessons", label: "Lessons", icon: CalendarDays, hint: "Every lesson, disputes, hour verification" },
    ],
  },
  {
    label: "Safety",
    items: [
      { href: "/admin/consents", label: "Parent calls", icon: PhoneCall, badge: "calls", hint: "Confirm consent by phone" },
      { href: "/admin/reports", label: "Reports", icon: Siren, badge: "reports", hint: "Concerns people have reported" },
      { href: "/admin/safety", label: "Safety scan", icon: ShieldAlert, badge: "flags", hint: "Messages the scanner flagged" },
      { href: "/admin/messages", label: "Messages", icon: MessagesSquare, hint: "Read any conversation" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/activity", label: "Activity log", icon: Activity, hint: "Everything that happened, in order" },
      { href: "/admin/emails", label: "Emails", icon: Mail, hint: "Outbox, failures, retries" },
      { href: "/admin/settings", label: "Settings & health", icon: Settings, hint: "Partner, alerts, scheduled jobs" },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items);

function useIsActive() {
  const pathname = usePathname();
  return (i: Item) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
}

function ItemIcon({ icon: Icon, active, onInk }: { icon: Item["icon"]; active: boolean; onInk?: boolean }) {
  const { pending } = useLinkStatus();
  const on = onInk ? "text-glow" : "text-pine-700";
  return pending ? <Spinner className={cn("size-4", active ? on : "text-pine-700")} /> : <Icon className={cn("size-4", active ? on : "text-muted")} strokeWidth={1.9} />;
}

function CountPill({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="rounded-full bg-clay-700 px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-white">{n > 99 ? "99+" : n}</span>;
}

/** Jump straight to a person from anywhere in the console. */
export function PeopleSearch({ className }: { className?: string }) {
  return (
    <form action="/admin/people" role="search" className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input
        name="q"
        type="search"
        placeholder="Find a person…"
        aria-label="Find a person by name, email or school"
        className="h-10 w-full rounded-full border border-ink/14 bg-white/85 pl-9 pr-3 text-sm placeholder:text-faint focus:border-ink/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-glow/50"
      />
    </form>
  );
}

export function AdminSideNav({ counts }: { counts: Counts }) {
  const isActive = useIsActive();
  return (
    <nav className="flex flex-col gap-5" aria-label="Admin">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-2 px-3.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">{g.label}</p>
          <ul className="flex flex-col gap-1">
            {g.items.map((i) => {
              const active = isActive(i);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-[14px] transition-[background-color,color,box-shadow]",
                      active ? "bg-ink font-semibold text-cream shadow-[0_10px_24px_-14px_rgb(22_32_28/0.6)]" : "font-medium text-ink-2 hover:bg-white/80 hover:text-ink",
                    )}
                  >
                    <ItemIcon icon={i.icon} active={active} onInk />
                    <span className="flex-1">{i.label}</span>
                    <CountPill n={i.badge ? counts[i.badge] : 0} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone header: names the current section, shows urgent counts, and opens a full menu. */
export function AdminMobileBar({ counts }: { counts: Counts }) {
  const pathname = usePathname();
  const isActive = useIsActive();
  const current = ALL.filter(isActive).sort((a, b) => b.href.length - a.href.length)[0];
  const urgent = counts.reports + counts.flags;
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink/[0.08] bg-cream/80 px-4 backdrop-blur-md lg:hidden">
        <Link href="/admin" aria-label="Admin overview" className="shrink-0">
          <LogoMark className="size-7" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[18px] font-[560] leading-tight tracking-[-0.012em]">{current?.label ?? "Admin"}</p>
          <p className="font-mono text-[9.5px] uppercase leading-tight tracking-[0.16em] text-muted">Admin console</p>
        </div>
        {urgent > 0 && (
          <Link href={counts.reports ? "/admin/reports" : "/admin/safety"} className="flex shrink-0 items-center gap-1 rounded-full bg-clay-50 px-2.5 py-1 text-xs font-medium text-clay-800 ring-1 ring-clay-500/25">
            <Siren className="size-3.5" /> {urgent} urgent
          </Link>
        )}
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-paper-2" aria-label="Open admin menu">
          <Menu className="size-5" />
        </button>
      </header>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        aria-label="Admin menu"
        className="m-0 ml-auto h-dvh max-h-none w-[min(22rem,90vw)] max-w-none animate-fade overflow-y-auto bg-cream p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-[3px] lg:hidden"
      >
        <div className="flex items-center justify-between border-b border-ink/[0.08] px-4 py-3">
          <p className="eyebrow">Admin console</p>
          <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted hover:bg-paper-2" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-3 py-4">
          <PeopleSearch className="mb-5" />
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-5">
              <p className="mb-2 px-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">{g.label}</p>
              <ul className="flex flex-col gap-1">
                {g.items.map((i) => {
                  const active = isActive(i);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => active && setOpen(false)}
                        className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5", active ? "bg-white shadow-card ring-1 ring-ink/10" : "active:bg-paper-2")}
                      >
                        <ItemIcon icon={i.icon} active={active} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm", active ? "font-semibold" : "font-medium")}>{i.label}</span>
                          <span className="block truncate text-xs text-muted">{i.hint}</span>
                        </span>
                        <CountPill n={i.badge ? counts[i.badge] : 0} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <form action={adminLogout} className="border-t border-ink/[0.08] pt-4">
            <button className="lm-btn lm-btn-ink lm-btn-sm w-full">
              <LogOut className="size-4" /> Sign out of admin
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

/**
 * Keeps every admin page in sync with the database: refreshes every 30s and
 * when the tab regains focus, and shows when data was last fetched with a
 * manual refresh button.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => start(() => router.refresh());
    const tick = () => document.visibilityState === "visible" && refresh();
    const id = setInterval(tick, seconds * 1000);
    const clock = setInterval(() => setNow(Date.now()), 5000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      clearInterval(clock);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);

  // A finished refresh (or a navigation) means the page now shows fresh data.
  useEffect(() => {
    if (!pending) {
      setFetchedAt(Date.now());
      setNow(Date.now());
    }
  }, [pending, pathname]);

  const age = Math.max(0, Math.round((now - fetchedAt) / 1000));
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] text-muted transition hover:bg-paper-2 hover:text-ink disabled:opacity-70"
      title="Data refreshes automatically every 30 seconds. Click to refresh now."
    >
      <RotateCw className={cn("size-3.5", pending && "animate-spin")} />
      {pending ? "Refreshing…" : age < 10 ? "Up to date" : `Updated ${age < 60 ? `${Math.floor(age / 5) * 5}s` : `${Math.floor(age / 60)}m`} ago`}
    </button>
  );
}
