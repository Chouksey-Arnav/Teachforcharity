import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyThreads } from "@/lib/data";
import { ThreadList } from "./thread-list";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireViewer(["family", "tutor"]);
  const supabase = await createClient();
  const threads = await getMyThreads(supabase);
  return (
    <div className="-mx-4 sm:mx-0">
      <div className="grid overflow-hidden border-line bg-card sm:rounded-2xl sm:border lg:h-[calc(100dvh-8rem)] lg:grid-cols-[320px_1fr]">
        <ThreadList threads={threads} />
        <div className="min-h-0 min-w-0">{children}</div>
      </div>
    </div>
  );
}
