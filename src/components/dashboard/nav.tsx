"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Flag,
  HeartHandshake,
  Home,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Search,
  Settings,
  ShieldAlert,
  UserRound,
  Users,
  GraduationCap,
} from "lucide-react";
import type { NavItem, NavIcon } from "./nav-config";
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
} as const satisfies Record<NavIcon, unknown>;

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function SidebarNav({ main, secondary }: { main: NavItem[]; secondary: NavItem[] }) {
  const pathname = usePathname();
  const render = (items: NavItem[]) =>
    items.map((item) => {
      const Icon = ICONS[item.icon];
      const active = isActive(pathname, item);
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition",
            active ? "bg-card font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-paper-2 hover:text-ink",
          )}
        >
          <Icon className={cn("size-[18px]", active ? "text-pine-700" : "text-muted group-hover:text-ink-2")} strokeWidth={1.8} />
          <span className="flex-1">{item.label}</span>
          {!!item.badge && (
            <span className="min-w-5 rounded-full bg-brass-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-pine-950">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </Link>
      );
    });
  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Dashboard">
      {render(main)}
      <div className="my-3 h-px bg-line" />
      {render(secondary)}
    </nav>
  );
}

export function MobileTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const tabs = items.filter((i) => i.mobile).slice(0, 5);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Dashboard"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <Link key={item.href} href={item.href} className={cn("relative flex flex-col items-center gap-0.5 py-2.5 text-[11px]", active ? "text-pine-800" : "text-muted")}>
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              {item.label.split(" ")[0]}
              {!!item.badge && <span className="absolute right-[calc(50%-18px)] top-1.5 size-2 rounded-full bg-brass-500 ring-2 ring-paper" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
