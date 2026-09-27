"use client";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState error={error} retry={retry} homeHref="/admin" homeLabel="Admin overview" />;
}
