"use client";
import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button, LinkButton } from "./button";

/** Shared body for error.tsx boundaries: explains, retries, and offers a way out. */
export function ErrorState({ error, retry, homeHref, homeLabel }: { error: Error & { digest?: string }; retry: () => void; homeHref: string; homeLabel: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-clay-50 text-clay-700 ring-1 ring-clay-500/20">
        <TriangleAlert className="size-5" />
      </span>
      <h1 className="display mt-5 text-3xl">{offline ? "You’re offline" : "This page didn’t load"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {offline
          ? "Check your connection, then try again. Nothing you already saved was lost."
          : "Something went wrong on our side. Trying again usually fixes it — nothing you already saved was lost."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCw className="size-4" /> Try again
        </Button>
        <LinkButton href={homeHref} variant="secondary">
          {homeLabel}
        </LinkButton>
      </div>
      {error.digest && <p className="mt-6 text-[11px] text-faint">Reference: {error.digest}</p>}
    </div>
  );
}
