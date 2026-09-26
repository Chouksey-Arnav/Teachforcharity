import { ClipboardCheck } from "lucide-react";
import type { Viewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkButton } from "@/components/ui/button";
import { greeting } from "./greeting";

export async function ReviewerHome({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const { data: weeks } = await supabase.rpc("review_weeks", { p_limit: 12 });
  const waiting = (weeks ?? []).reduce((a, w) => a + w.confirmed, 0);
  const verifiedMin = (weeks ?? []).reduce((a, w) => a + w.minutes_verified, 0);
  return (
    <>
      <PageHeader eyebrow={greeting()} title={`Hi, ${viewer.profile.full_name.split(" ")[0] || "there"}`} description="Thank you for verifying our tutors’ volunteer hours." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-6">
          <ClipboardCheck className="size-6 text-pine-700" />
          <p className="display mt-3 text-5xl">{waiting}</p>
          <p className="mt-1 text-sm text-muted">family-confirmed lessons waiting for verification</p>
          <LinkButton href="/dashboard/review" className="mt-5">
            Start weekly review
          </LinkButton>
        </div>
        <div className="rounded-2xl border border-line bg-card p-6">
          <p className="display text-5xl">{(verifiedMin / 60).toFixed(1)}</p>
          <p className="mt-1 text-sm text-muted">hours verified in the last 12 weeks</p>
        </div>
      </div>
    </>
  );
}
