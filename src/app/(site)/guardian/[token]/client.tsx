"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { ConsentForm, type ConsentValues } from "@/components/forms/consent-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { INCIDENT_CATEGORIES } from "@/lib/constants";
import { guardianDeleteAccount, guardianReport, guardianRevoke, guardianSignConsent } from "@/app/actions/guardian";

export function GuardianConsent({ token, studentName, guardianName }: { token: string; studentName: string; guardianName: string }) {
  const router = useRouter();
  const [v, setV] = useState<ConsentValues>({ guardianName, relationship: "", phone: "", signature: "", acks: [false, false, false, false, false, false] });
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!adult) return setError("Please confirm you're the parent or legal guardian and 18 or older.");
        if (v.acks.some((a) => !a)) return setError("Please check every box to give consent.");
        start(async () => {
          setError(null);
          const r = await guardianSignConsent({
            token,
            guardianName: v.guardianName,
            relationship: v.relationship,
            phone: v.phone,
            signature: v.signature,
            adultGuardian: true,
            acks: v.acks as true[],
            userAgent: navigator.userAgent,
          });
          if (r && !r.ok) return setError(r.error.message);
          router.refresh();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }}
      className="space-y-6"
    >
      <ConsentForm studentName={studentName} value={v} onChange={setV} />
      <div className="rounded-2xl border border-line bg-card p-4">
        <Checkbox
          checked={adult}
          onChange={(e) => setAdult(e.target.checked)}
          label={<span className="font-medium text-ink">I’m {studentName}’s parent or legal guardian, and I’m 18 or older.</span>}
          description="Only a parent or legal guardian may give consent. Giving false information here violates our Terms."
        />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" size="lg" pending={pending} className="w-full sm:w-auto">
        <ShieldCheck className="size-4" /> Sign & approve {studentName}’s account
      </Button>
    </form>
  );
}

export function GuardianReport({ token, tutors }: { token: string; tutors: { id: string; name: string }[] }) {
  const [category, setCategory] = useState("");
  const [tutorId, setTutorId] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!category) return setState({ ok: false, text: "Choose what kind of concern this is." });
        start(async () => {
          const r = await guardianReport({ token, category: category as "other", description, tutorId });
          if (r?.ok) {
            setState({ ok: true, text: r.message ?? "Report received." });
            setDescription("");
          } else if (r) setState({ ok: false, text: r.error.message });
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What kind of concern?" htmlFor="cat">
          <Select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="About which tutor?" htmlFor="tutor" optional>
          <Select id="tutor" value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
            <option value="">Not about a specific tutor</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {category && <p className="text-[13px] text-muted">{INCIDENT_CATEGORIES.find((c) => c.key === category)?.hint}</p>}
      <Field label="What happened?" htmlFor="desc">
        <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} />
      </Field>
      {state && <Notice tone={state.ok ? "success" : "danger"}>{state.text}</Notice>}
      <Button type="submit" variant="danger" pending={pending}>
        Send report
      </Button>
      <p className="text-xs text-muted">If anyone is in immediate danger, call 911.</p>
    </form>
  );
}

export function GuardianControls({ token, studentName, consented }: { token: string; studentName: string; consented: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [pending, start] = useTransition();
  if (deleted)
    return (
      <Notice tone="success" title="Deleted">
        {studentName}’s account and data were deleted. We emailed you a confirmation.
      </Notice>
    );
  return (
    <div className="space-y-6">
      {consented && (
        <div className="rounded-2xl border border-line bg-card p-5">
          <h3 className="font-semibold">Withdraw consent</h3>
          <p className="mt-1 text-sm text-muted">Pauses messaging and cancels upcoming lessons. You can approve again later from this page.</p>
          <Button
            variant="secondary"
            className="mt-4"
            pending={pending}
            onClick={() =>
              start(async () => {
                if (!window.confirm(`Withdraw consent for ${studentName}? Upcoming lessons will be cancelled.`)) return;
                const r = await guardianRevoke({ token });
                setState(r?.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r?.error.message ?? "Something went wrong." });
                router.refresh();
              })
            }
          >
            Withdraw consent
          </Button>
        </div>
      )}
      <div className="rounded-2xl border border-clay-500/25 bg-clay-50/60 p-5">
        <h3 className="font-semibold text-clay-800">Delete {studentName}’s account</h3>
        <p className="mt-1 text-sm text-ink-2">
          Permanently deletes the profile and messages. If a lesson already happened, only its date and length are kept so the volunteer tutor’s
          hours record stays accurate — with no names attached.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={`Type “${studentName}” to confirm`} htmlFor="confirm" className="sm:w-64">
            <Input id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
          <Button
            variant="danger"
            pending={pending}
            disabled={confirm.trim().toLowerCase() !== studentName.trim().toLowerCase()}
            onClick={() =>
              start(async () => {
                const r = await guardianDeleteAccount({ token, confirm });
                if (r?.ok) setDeleted(true);
                else setState({ ok: false, text: r?.error.message ?? "Something went wrong." });
              })
            }
          >
            Delete permanently
          </Button>
        </div>
      </div>
      {state && <Notice tone={state.ok ? "success" : "danger"}>{state.text}</Notice>}
    </div>
  );
}
