import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyThreads, getStudentKinds } from "@/lib/data";
import { ThreadList } from "./thread-list";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer(["family", "tutor"]);
  const supabase = await createClient();
  const [threads, kinds, communications] = await Promise.all([
    getMyThreads(supabase),
    viewer.role === "tutor" ? getStudentKinds(supabase) : Promise.resolve(new Map()),
    viewer.role === "family" ? supabase.rpc("family_comms_threads") : Promise.resolve({ data: [] }),
  ]);
  const selfManaged = [...kinds.entries()].filter(([, k]) => k === "student").map(([id]) => id);
  return (
    <div className="-mx-4 sm:mx-0">
      <div className="grid overflow-hidden border-line bg-card sm:rounded-2xl sm:border lg:h-[calc(100dvh-8rem)] lg:grid-cols-[320px_1fr]">
        <ThreadList threads={threads} communications={communications.data ?? []} selfManaged={selfManaged} studentAccount={viewer.profile.account_kind === "student"} />
        <div className="min-h-0 min-w-0">{children}</div>
      </div>
    </div>
  );
}
