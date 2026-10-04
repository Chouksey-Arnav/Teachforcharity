"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { returnConsentForm, verifyConsent } from "@/app/actions/admin";
import { FORM_CHECKS, type FormCheck } from "@/lib/consent-form/checks";
import { Button } from "@/components/ui/button";
import { Checkbox, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

/**
 * Review a photo of a signed consent form. Verifying needs every check ticked
 * (the database re-checks); anything fixable goes back to the parent instead.
 */
export function ConsentFormReview({
  consentId,
  code,
  guardianName,
  studentName,
}: {
  consentId: string;
  code: string;
  guardianName: string;
  studentName: string;
}) {
  const labels: Record<FormCheck, string> = {
    code: `The code on the paper is exactly ${code}`,
    names: `The printed name is ${guardianName}, and the form is for ${studentName}`,
    ink_signature: "Signed by hand in ink — not typed, pasted or drawn on a screen",
    whole_form: "The whole signature section is in the photo and nothing looks edited, covered or cut off",
  };
  const [checks, setChecks] = useState<FormCheck[]>([]);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!res?.ok) return;
    const t = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(t);
  }, [res, router]);

  const allChecked = FORM_CHECKS.every((c) => checks.includes(c));
  const toggle = (c: FormCheck, on: boolean) => setChecks((xs) => (on ? [...new Set([...xs, c])] : xs.filter((x) => x !== c)));

  if (res?.ok) return <Notice tone="success" className="m-4">{res.message}</Notice>;
  return (
    <div className="space-y-4 border-t border-line bg-paper/50 px-5 py-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-[13px] font-medium">Check the photo against this record</legend>
        {FORM_CHECKS.map((c) => (
          <Checkbox key={c} checked={checks.includes(c)} onChange={(e) => toggle(c, e.target.checked)} label={labels[c]} />
        ))}
      </fieldset>
      <div>
        <label className="block text-[13px] font-medium" htmlFor={`fnote-${consentId}`}>
          Notes
        </label>
        <Textarea
          id={`fnote-${consentId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Printed form, code and name match, signed and dated in blue ink."
          className="min-h-16 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          pending={pending}
          disabled={!allChecked || note.trim().length < 3}
          onClick={() => start(async () => setRes(await verifyConsent({ consentId, verified: true, note, method: "signed_form", checks })))}
        >
          Verified — the form checks out
        </Button>
        <Button
          size="sm"
          variant="danger"
          pending={pending}
          disabled={note.trim().length < 3}
          onClick={() => {
            if (!window.confirm(`Withdraw this consent? ${guardianName} will be emailed and any requests cancelled. Use “Send back” for a photo that just needs retaking.`)) return;
            start(async () => setRes(await verifyConsent({ consentId, verified: false, note, method: "signed_form" })));
          }}
        >
          Couldn’t verify — looks wrong
        </Button>
      </div>
      <div className="space-y-2 rounded-xl border border-line bg-card px-4 py-3">
        <label className="block text-[13px] font-medium" htmlFor={`freason-${consentId}`}>
          Or send the photo back (blurry, code cut off, typed signature…). The parent sees this message.
        </label>
        <Textarea
          id={`freason-${consentId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="e.g. The photo is too blurry to read the code. Please retake it in good light with the whole page in view."
          className="min-h-14 text-sm"
        />
        <Button
          size="sm"
          variant="secondary"
          pending={pending}
          disabled={reason.trim().length < 5}
          onClick={() => start(async () => setRes(await returnConsentForm({ consentId, reason })))}
        >
          Send back for a retake
        </Button>
      </div>
      {res && !res.ok && <Notice tone="danger">{res.error.message}</Notice>}
    </div>
  );
}
