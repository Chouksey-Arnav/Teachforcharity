import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";

/** Fills the conversation pane while a thread opens; the thread list stays put. */
export default function ConversationLoading() {
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-0 flex-col lg:h-full">
      <LoadingLabel>Opening conversation…</LoadingLabel>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <Skeleton className="size-[38px] rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="flex-1 space-y-3 bg-paper/50 px-4 py-6 sm:px-6">
        <Skeleton className="h-12 w-3/5 rounded-2xl" />
        <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
        <Skeleton className="h-16 w-1/2 rounded-2xl" />
      </div>
    </div>
  );
}
