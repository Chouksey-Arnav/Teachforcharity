import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { UpdateItem } from "@/lib/updates";
import { UpdateList } from "./update-row";

/** Home's "New for you": the newest unread updates, so nothing waits behind a menu. Hidden when there's nothing new. */
export function UpdatesPreview({ items, limit = 3 }: { items: UpdateItem[]; limit?: number }) {
  const unread = items.filter((u) => u.unread);
  if (!unread.length) return null;
  return (
    <section className="mb-10 animate-rise" aria-labelledby="home-updates">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="home-updates" className="flex items-center gap-2 text-lg font-semibold">
          <span className="size-2 rounded-full bg-brass-600" aria-hidden /> New for you
        </h2>
        <Link
          href="/dashboard/updates"
          className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink"
        >
          {unread.length > limit ? `See all ${unread.length}` : "All updates"} <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <UpdateList items={unread.slice(0, limit)} compact />
    </section>
  );
}
