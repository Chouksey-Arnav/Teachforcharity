"use client";
import { ErrorState } from "@/components/ui/error-state";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="p-[clamp(8px,1.2vw,18px)]">
      <div className="lm-sky lm-sky-dusk lm-panel flex min-h-[calc(100dvh-2*clamp(8px,1.2vw,18px))] items-center justify-center">
        <ErrorState error={error} retry={retry} homeHref="/" homeLabel="Home page" />
      </div>
    </main>
  );
}
