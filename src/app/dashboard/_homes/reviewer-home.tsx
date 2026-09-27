import { BadgeCheck, ClipboardCheck, Clock3, UsersRound } from "lucide-react";
import type { Viewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkButton } from "@/components/ui/button";
import { greeting } from "./greeting";

const FLOW = [
  { icon: Clock3, title: "Tutor logs the lesson", text: "Right after it ends, with a short note." },
  { icon: UsersRound, title: "Family confirms it happened", text: "The student’s side taps “Yes” — or flags it." },
  { icon: BadgeCheck, title: "You verify the week", text: "Approve in bulk, or reject with a reason." },
];

export async function ReviewerHome({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const { data: weeks } = await supabase.rpc("review_weeks", { p_limit: 12 });
  const waiting = (weeks ?? []).reduce((a, w) => a + w.confirmed, 0);
  const verifiedMin = (weeks ?? []).reduce((a, w) => a + w.minutes_verified, 0);
  return (
    <>
      <PageHeader eyebrow={greeting()} title={`Hi, ${viewer.profile.full_name.split(" ")[0] || "there"}`} description="Thank you for verifying our tutors’ volunteer hours." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={waiting ? "rounded-2xl border border-brass-300 bg-brass-50 p-6" : "rounded-2xl border border-line bg-card p-6"}>
          <ClipboardCheck className="size-6 text-pine-700" />
          <p className="display mt-3 text-5xl">{waiting}</p>
          <p className="mt-1 text-sm text-muted">{waiting === 1 ? "family-confirmed lesson" : "family-confirmed lessons"} waiting for you</p>
          <LinkButton href="/dashboard/review" className="mt-5" variant={waiting ? "primary" : "secondary"}>
            {waiting ? "Start weekly review" : "Open the review page"}
          </LinkButton>
        </div>
        <div className="rounded-2xl border border-line bg-card p-6">
          <BadgeCheck className="size-6 text-pine-700" />
          <p className="display mt-3 text-5xl">{(verifiedMin / 60).toFixed(1)}</p>
          <p className="mt-1 text-sm text-muted">hours verified in the last 12 weeks</p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">How an hour gets verified</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {FLOW.map((f, i) => (
            <li key={f.title} className="rounded-2xl border border-line bg-card p-5">
              <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                <span className="flex size-6 items-center justify-center rounded-full bg-paper-2 text-ink-2">{i + 1}</span>
                <f.icon className="size-4 text-pine-700" />
              </span>
              <p className="mt-3 text-sm font-semibold">{f.title}</p>
              <p className="mt-1 text-[13px] text-muted">{f.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">Only lessons both sides agree on reach you. Disputed lessons go to the program team instead.</p>
      </section>
    </>
  );
}
