"use client";
import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, MessageCircle } from "lucide-react";
import { openThread } from "@/app/actions/messages";
import { Button, LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Opens (or starts) the conversation with this tutor without sending anything. */
export function MessageTutorButton({ tutorId, studentId, threadHref, disabledReason, label }: { tutorId: string; studentId?: string; threadHref?: string; disabledReason?: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (threadHref)
    return (
      <LinkButton href={threadHref} variant="secondary">
        <MessageCircle className="size-4" aria-hidden /> {label}
      </LinkButton>
    );
  return (
    <span className="inline-flex flex-col">
      <Button
        variant="secondary"
        pending={pending}
        disabled={Boolean(disabledReason) || !studentId}
        title={disabledReason}
        onClick={() =>
          start(async () => {
            const r = await openThread(tutorId, studentId!);
            if (r && !r.ok) setError(r.error.message);
          })
        }
      >
        {!pending && <MessageCircle className="size-4" aria-hidden />} {label}
      </Button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-clay-700">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * Phones: the booking form sits below the profile, so keep a "Book" bar in
 * reach (above the tab bar) until the form itself is on screen.
 */
export function StickyBookBar({ label, sub }: { label: string; sub?: string }) {
  const [formVisible, setFormVisible] = useState(true);
  useEffect(() => {
    const el = document.getElementById("book");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormVisible(e.isIntersecting), { rootMargin: "0px 0px -35% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      className={cn(
        "fixed inset-x-0 z-30 border-t border-line bg-card/95 px-4 py-2.5 shadow-pop backdrop-blur transition-transform duration-200 lg:hidden",
        "bottom-[calc(env(safe-area-inset-bottom)+3.75rem)]",
        formVisible ? "pointer-events-none translate-y-[200%]" : "translate-y-0",
      )}
      aria-hidden={formVisible}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{label}</p>
          {sub && <p className="truncate text-xs text-muted">{sub}</p>}
        </div>
        <a
          href="#book"
          tabIndex={formVisible ? -1 : 0}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-pine-700 px-4 text-sm font-medium text-white hover:bg-pine-800"
        >
          <CalendarPlus className="size-4" aria-hidden /> Book
        </a>
      </div>
    </div>
  );
}
