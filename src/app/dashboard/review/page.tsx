import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Empty } from "@/components/ui/empty";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/cn";
import { ReviewQueue, type ReviewRow } from "./review-queue";

export const metadata: Metadata = { title: "Verify hours" };

function mondayOf(d: Date): string {
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const diff = (et.getDay() + 6) % 7;
  et.setDate(et.getDate() - diff);
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
}

export default async function ReviewPage({ searchParams }: PageProps<"/dashboard/review">) {
  await requireViewer(["reviewer", "admin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: weeks } = await supabase.rpc("review_weeks", { p_limit: 26 });
  const firstWithWork = (weeks ?? []).find((w) => w.confirmed > 0)?.week_start;
  const week = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : (firstWithWork ?? weeks?.[0]?.week_start ?? mondayOf(new Date()));
  const { data: rows } = await supabase.rpc("review_queue", { p_week_start: week });
  const weekEnd = new Date(`${week}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  return (
    <>
      <PageHeader
        eyebrow="Weekly verification"
        title="Verify volunteer hours"
        description="Each lesson below was logged by the tutor and confirmed by the student’s parent. Verify the ones that look right; reject with a reason if something’s off."
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label="Weeks">
          {(weeks ?? []).map((w) => (
            <Link
              key={w.week_start}
              href={`/dashboard/review?week=${w.week_start}`}
              className={cn(
                "shrink-0 rounded-xl border px-3.5 py-2.5 text-sm transition",
                w.week_start === week ? "border-pine-700 bg-card shadow-card" : "border-transparent hover:bg-paper-2",
              )}
            >
              <span className="block font-medium">Week of {formatDate(`${w.week_start}T12:00:00Z`).replace(/, \d{4}$/, "")}</span>
              <span className="block text-xs text-muted">
                {w.confirmed > 0 ? <span className="font-medium text-brass-800">{w.confirmed} to verify</span> : `${w.verified} verified`}
                {w.awaiting_family > 0 && ` · ${w.awaiting_family} awaiting family`}
              </span>
            </Link>
          ))}
          {!weeks?.length && <p className="text-sm text-muted">No logged lessons yet.</p>}
        </nav>
        <div className="min-w-0">
          <h2 className="mb-4 text-lg font-semibold">
            {formatDate(`${week}T12:00:00Z`)} – {formatDate(weekEnd)}
          </h2>
          {!rows?.length ? (
            <Empty icon={<ClipboardCheck className="size-5" />} title="Nothing logged this week" />
          ) : (
            <ReviewQueue rows={rows as ReviewRow[]} />
          )}
        </div>
      </div>
    </>
  );
}
