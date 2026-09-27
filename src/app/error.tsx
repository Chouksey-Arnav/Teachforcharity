"use client";
import { ErrorState } from "@/components/ui/error-state";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center">
      <ErrorState error={error} retry={retry} homeHref="/" homeLabel="Home page" />
    </main>
  );
}
