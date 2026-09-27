import { LoadingLabel, Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="animate-fade">
      <LoadingLabel />
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="h-11 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-10 grid gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
