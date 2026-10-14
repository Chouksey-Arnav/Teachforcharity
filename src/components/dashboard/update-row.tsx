"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell, CalendarDays, CheckCircle2, Clock3, HandHeart, ListChecks, MessageCircle, ShieldCheck, Sparkles, Trophy, XCircle } from "lucide-react";
import type { UpdateIcon, UpdateItem, UpdateTone } from "@/lib/updates";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const ICONS: Record<UpdateIcon, typeof Bell> = {
  message: MessageCircle,
  calendar: CalendarDays,
  check: CheckCircle2,
  x: XCircle,
  clock: Clock3,
  practice: ListChecks,
  hours: Trophy,
  shield: ShieldCheck,
  bell: Bell,
  spark: Sparkles,
  hand: HandHeart,
};

const TONES: Record<UpdateTone, string> = {
  neutral: "bg-paper-2 text-ink-2",
  good: "bg-mint/55 text-pine-800",
  action: "bg-brass-100 text-brass-800",
  bad: "bg-clay-50 text-clay-700",
};

/** Tells the server an update was opened. A beacon survives the page changing, so the tap is never slowed down. */
export function sendRead(ids: number[]) {
  const body = JSON.stringify({ ids });
  try {
    if (navigator.sendBeacon?.("/dashboard/updates/read", new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
  } catch {
    // fall through
  }
  void fetch("/dashboard/updates/read", { method: "POST", body, headers: { "Content-Type": "text/plain;charset=UTF-8" }, keepalive: true }).catch(() => {});
}

/**
 * One update: who or what, one line of detail, how long ago, and a button that
 * says what tapping does. The whole row is the link (big target on a phone).
 */
export function UpdateRow({ item, compact }: { item: UpdateItem; compact?: boolean }) {
  const [unread, setUnread] = useState(item.unread);
  const { view } = item;
  const Icon = ICONS[view.icon];
  return (
    <li className="border-b border-ink/[0.07] last:border-0">
      <Link
        href={view.href}
        prefetch={false}
        onClick={() => {
          if (!unread) return;
          setUnread(false);
          sendRead([item.id]);
        }}
        className={cn(
          "group flex items-start gap-3 px-4 py-3.5 transition-colors sm:gap-4 sm:px-5 sm:py-4",
          unread ? "bg-brass-50/70 hover:bg-brass-50" : "hover:bg-paper",
        )}
      >
        <span className="relative mt-0.5 shrink-0">
          {view.person ? (
            <Avatar name={view.person.name} path={view.person.avatar} size={compact ? 38 : 44} />
          ) : (
            <span className={cn("flex items-center justify-center rounded-full", TONES[view.tone], compact ? "size-[38px]" : "size-11")}>
              <Icon className="size-5" strokeWidth={1.9} />
            </span>
          )}
          {view.person && (
            <span className={cn("absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full ring-2 ring-white", TONES[view.tone])}>
              <Icon className="size-3" strokeWidth={2.2} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[15px] leading-snug text-ink", unread ? "font-semibold" : "font-medium")}>{view.title}</span>
          {view.detail && <span className="mt-0.5 line-clamp-2 block break-words text-[13.5px] leading-snug text-muted">{view.detail}</span>}
          <span className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
            {unread && <span className="size-2 rounded-full bg-brass-600" aria-hidden />}
            <span className="sr-only">{unread ? "New. " : ""}</span>
            {item.when}
          </span>
        </span>
        <span className={buttonClass(unread ? "primary" : "secondary", "sm", "mt-0.5 hidden px-3.5 group-hover:-translate-y-px sm:inline-flex")} aria-hidden>
          {view.cta}
        </span>
        <span className="mt-1 shrink-0 text-[13px] font-semibold text-pine-700 sm:hidden" aria-hidden>
          {view.cta} →
        </span>
      </Link>
    </li>
  );
}

/** A card of update rows. */
export function UpdateList({ items, compact, className }: { items: UpdateItem[]; compact?: boolean; className?: string }) {
  return (
    <ul className={cn("overflow-hidden rounded-2xl border border-line bg-card shadow-card", className)}>
      {items.map((it) => (
        <UpdateRow key={it.id} item={it} compact={compact} />
      ))}
    </ul>
  );
}
