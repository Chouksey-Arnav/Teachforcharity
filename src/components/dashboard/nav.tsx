"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Compass,
  ExternalLink,
  Flag,
  GraduationCap,
  HeartHandshake,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Search,
  Settings,
  ShieldAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { allItems, type Nav, type NavIcon, type NavItem } from "./nav-config";
import { LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/button";
import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/cn";

const ICONS = {
  home: Home,
  search: Search,
  calendar: CalendarDays,
  messages: MessageCircle,
  students: Users,
  profile: UserRound,
  hours: Clock3,
  report: Flag,
  review: ClipboardCheck,
  overview: LayoutDashboard,
  tutors: GraduationCap,
  families: Users,
  incidents: ShieldAlert,
  partners: HeartHandshake,
  settings: Settings,
  emails: Mail,
  verified: BadgeCheck,
  inbox: Inbox,
  discover: Compass,
} as const satisfies Record<NavIcon, unknown>;

export interface Account {
  name: string;
  email: string;
  avatarPath: string | null;
  roleLabel: string;
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Pages that aren't in the menu themselves but still deserve a name in the phone header. */
const EXTRA_TITLES: [string, string][] = [["/dashboard/my-students/", "Student"]];

/** Title of the page being viewed: the longest matching nav href wins (so /dashboard/tutors beats /dashboard). */
function useCurrentTitle(nav: Nav): string {
  const pathname = usePathname();
  const item = allItems(nav)
    .filter((i) => isActive(pathname, i))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return item?.label ?? EXTRA_TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "Dashboard";
}

const badgeText = (n: number) => (n > 99 ? "99+" : String(n));

/** Swaps the icon for a spinner while the link's page is loading, so every tap gets instant feedback. */
function NavIconSlot({ icon, active, className }: { icon: NavIcon; active: boolean; className?: string }) {
  const { pending } = useLinkStatus();
  const Icon = ICONS[icon];
  if (pending) return <Spinner className={cn("text-pine-700", className)} />;
  return <Icon className={cn(active ? "text-pine-700" : "text-muted group-hover:text-ink-2", className)} strokeWidth={active ? 2.1 : 1.8} />;
}

export function SidebarNav({ nav }: { nav: Nav }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-6" aria-label="Dashboard">
      {nav.groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition",
                      active ? "bg-card font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-paper-2 hover:text-ink",
                      item.tone === "danger" && !active && "text-clay-700 hover:text-clay-800",
                    )}
                  >
                    <NavIconSlot icon={item.icon} active={active} className="size-[18px]" />
                    <span className="flex-1">{item.label}</span>
                    {!!item.badge && (
                      <span className="min-w-5 rounded-full bg-brass-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-pine-950" aria-label={`${item.badge} new`}>
                        {badgeText(item.badge)}
                      </span>
                    )}
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

/**
 * Phone chrome: a slim header that names the current page (plus a one-tap
 * "Report" and a menu button), up to four bottom tabs, and a "More" sheet that
 * lists every page, the account, and sign-out.
 */
export function MobileChrome({ nav, account }: { nav: Nav; account: Account }) {
  const pathname = usePathname();
  const title = useCurrentTitle(nav);
  const tabs = allItems(nav).filter((i) => i.tab).slice(0, 4);
  const moreBadge = allItems(nav).some((i) => !i.tab && i.badge);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  // Close the sheet whenever navigation lands on a new page.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const moreActive = !tabs.some((t) => isActive(pathname, t)) && pathname !== "/dashboard";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard" aria-label="Dashboard home" className="shrink-0">
          <LogoMark className="size-7" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</p>
        {!pathname.startsWith("/dashboard/report") && allItems(nav).some((i) => i.href === "/dashboard/report") && (
          <Link href="/dashboard/report" className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-clay-700 hover:bg-clay-50">
            <Flag className="size-3.5" /> Report
          </Link>
        )}
        <button type="button" onClick={() => setOpen(true)} className="-mr-1 shrink-0 rounded-full p-1 hover:bg-paper-2" aria-label="Open menu" aria-haspopup="dialog">
          <Avatar name={account.name} path={account.avatarPath} size={30} />
        </button>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Dashboard tabs">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("group relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "font-medium text-pine-800" : "text-muted")}
              >
                <span className={cn("flex h-6 w-12 items-center justify-center rounded-full transition", active && "bg-pine-100")}>
                  <NavIconSlot icon={item.icon} active={active} className="size-5" />
                </span>
                {item.short ?? item.label.split(" ")[0]}
                {!!item.badge && (
                  <span className="absolute left-[calc(50%+6px)] top-1 min-w-4 rounded-full bg-brass-500 px-1 text-center text-[10px] font-semibold leading-4 text-pine-950 ring-2 ring-paper">
                    {badgeText(item.badge)}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", moreActive ? "font-medium text-pine-800" : "text-muted")}
          >
            <span className={cn("flex h-6 w-12 items-center justify-center rounded-full", moreActive && "bg-pine-100")}>
              <Menu className="size-5" strokeWidth={moreActive ? 2.1 : 1.8} />
            </span>
            More
            {moreBadge && <span className="absolute left-[calc(50%+8px)] top-1.5 size-2 rounded-full bg-brass-500 ring-2 ring-paper" />}
          </button>
        </div>
      </nav>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        aria-label="Menu"
        className="m-0 mt-auto max-h-[88dvh] w-full max-w-none animate-rise overflow-y-auto rounded-t-3xl bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] lg:hidden"
      >
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-2" aria-hidden />
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
            <Avatar name={account.name} path={account.avatarPath} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{account.name}</p>
              <p className="truncate text-xs text-muted">
                {account.roleLabel} · {account.email}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted hover:bg-paper-2" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>

          {nav.groups.map((g) => (
            <div key={g.label} className="mt-5">
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.label}</p>
              <ul className="overflow-hidden rounded-2xl border border-line bg-card">
                {g.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href} className="border-b border-line last:border-0">
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => active && setOpen(false)}
                        className={cn("group flex items-center gap-3 px-4 py-3", active ? "bg-pine-50/70" : "active:bg-paper-2")}
                      >
                        <span className={cn("flex size-9 items-center justify-center rounded-full", item.tone === "danger" ? "bg-clay-50" : "bg-paper-2")}>
                          <NavIconSlot icon={item.icon} active={active} className={cn("size-[18px]", item.tone === "danger" && "text-clay-700")} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[15px]", active ? "font-semibold" : "font-medium", item.tone === "danger" && "text-clay-800")}>{item.label}</span>
                          {item.hint && <span className="block truncate text-xs text-muted">{item.hint}</span>}
                        </span>
                        {!!item.badge && (
                          <span className="min-w-5 rounded-full bg-brass-500 px-1.5 py-0.5 text-center text-[11px] font-semibold text-pine-950">{badgeText(item.badge)}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link href="/" className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-card px-3 py-3 text-sm text-ink-2">
              <ExternalLink className="size-4" /> Public website
            </Link>
            <form action={signOut}>
              <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-card px-3 py-3 text-sm text-ink-2">
                <LogOut className="size-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
