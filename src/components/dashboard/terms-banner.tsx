"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { acceptCurrentTerms } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";

/** Shown to existing users after the Terms change, until they accept the new version. */
export function TermsBanner({ tutor }: { tutor: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div role="region" aria-label="Updated terms" className="no-print mb-6 rounded-2xl border border-brass-300 bg-brass-50 px-4 py-4 sm:px-5">
      <p className="text-sm font-semibold text-ink">We’ve updated our terms</p>
      <p className="mt-1 text-sm text-ink-2">
        Parents now create students’ accounts and confirm by phone, tutors need their parent’s approval, and the Meet link appears only
        around lesson time. Please review the <Link href="/legal/terms" className="underline underline-offset-2">Terms</Link>,{" "}
        <Link href="/legal/privacy" className="underline underline-offset-2">Privacy Policy</Link> and{" "}
        {tutor ? (
          <Link href="/legal/tutor-agreement" className="underline underline-offset-2">Tutor Agreement</Link>
        ) : (
          <Link href="/legal/consent" className="underline underline-offset-2">Parent Consent</Link>
        )}
        .
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" pending={pending} onClick={() => start(async () => {
          const r = await acceptCurrentTerms();
          if (r && !r.ok) setError(r.error.message);
        })}>
          I agree
        </Button>
        {error && <span role="alert" className="text-sm text-clay-700">{error}</span>}
      </div>
    </div>
  );
}
