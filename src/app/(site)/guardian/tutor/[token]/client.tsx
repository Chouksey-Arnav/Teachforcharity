"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { tutorGuardianApprove, tutorGuardianWithdraw } from "@/app/actions/guardian";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function TutorGuardianApprove({ token, tutorFirst, guardianName }: { token: string; tutorFirst: string; guardianName: string }) {
  const router = useRouter();
  const [name, setName] = useState(guardianName);
  const [relationship, setRelationship] = useState("");
  const [signature, setSignature] = useState("");
  const [checks, setChecks] = useState([false, false, false]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (i: number) => setChecks((c) => c.map((v, j) => (j === i ? !v : v)));
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (checks.some((c) => !c)) return setError("Please check every box to approve.");
        start(async () => {
          setError(null);
          const r = await tutorGuardianApprove({
            token,
            name,
            relationship,
            signature,
            adultGuardian: true,
            readAgreement: true,
            understandsFormat: true,
          });
          if (r && !r.ok) return setError(r.error.message);
          router.refresh();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your full name" htmlFor="tg-name">
          <Input id="tg-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
        </Field>
        <Field label={`Relationship to ${tutorFirst}`} htmlFor="tg-rel">
          <Input id="tg-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Mother, Father, Legal guardian" maxLength={40} />
        </Field>
      </div>
      <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <Checkbox checked={checks[0]} onChange={() => toggle(0)} label={`I’m ${tutorFirst}’s parent or legal guardian, and I’m 18 or older.`} />
        <Checkbox checked={checks[1]} onChange={() => toggle(1)} label={`I’ve read the Tutor Agreement and Code of Conduct, and I allow ${tutorFirst} to volunteer.`} />
        <Checkbox
          checked={checks[2]}
          onChange={() => toggle(2)}
          label="I understand lessons are one-on-one video calls with middle schoolers, online only and never recorded, and that messages are monitored."
        />
      </div>
      <Field label="Signature" htmlFor="tg-sig" hint="Type your full name exactly as above.">
        <Input id="tg-sig" value={signature} onChange={(e) => setSignature(e.target.value)} autoComplete="off" maxLength={120} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" size="lg" pending={pending} className="w-full sm:w-auto">
        <ShieldCheck className="size-4" /> Approve {tutorFirst}
      </Button>
    </form>
  );
}

export function TutorGuardianWithdraw({ token, tutorFirst }: { token: string; tutorFirst: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        variant="danger"
        pending={pending}
        onClick={() => {
          if (!window.confirm(`Withdraw your approval? ${tutorFirst}’s profile will be paused and upcoming lessons cancelled.`)) return;
          start(async () => {
            const r = await tutorGuardianWithdraw({ token });
            setMsg(r?.ok ? { ok: true, text: r.message ?? "Withdrawn." } : { ok: false, text: r?.error.message ?? "Something went wrong." });
            if (r?.ok) router.refresh();
          });
        }}
      >
        Withdraw approval
      </Button>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice>}
    </div>
  );
}
