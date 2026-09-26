"use client";
import Link from "next/link";
import { Checkbox, Field, Input } from "@/components/ui/field";

export interface ConsentValues {
  guardianName: string;
  relationship: string;
  phone: string;
  signature: string;
  acks: boolean[];
}

export const CONSENT_ITEMS = (name: string) => [
  { title: "Online only", body: `All of ${name}’s lessons happen over Google Meet. There are no in-person lessons or meetings.` },
  { title: "No recording", body: "Lessons are never recorded — by the program, the tutor, or our family." },
  {
    title: "A parent is reachable",
    body: "A parent or guardian will be reachable by phone or text for the full length of every lesson (no need to watch it).",
  },
  {
    title: "Reporting concerns",
    body: "We’ll report any concern right away through the site. Reports are reviewed, and a tutor may be paused while that happens. In an emergency we call 911 first.",
  },
  { title: "Free — no payments", body: "Lessons are free. We won’t pay or give gifts to a tutor. Donations to the partner nonprofit are optional and separate." },
  {
    title: "Messaging & volunteers",
    body: "Messages stay on the platform, are filtered and checked automatically for safety (no AI services — our own software), and may be read by program admins. Tutors are high school volunteers whose skill levels are self-reported.",
  },
];

export function ConsentForm({ studentName, value, onChange }: { studentName: string; value: ConsentValues; onChange: (v: ConsentValues) => void }) {
  const items = CONSENT_ITEMS(studentName);
  const allChecked = value.acks.every(Boolean);
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="text-sm font-semibold">I understand and agree that:</p>
          <button
            type="button"
            className="text-xs font-medium text-pine-700 hover:underline"
            onClick={() => onChange({ ...value, acks: items.map(() => !allChecked) })}
          >
            {allChecked ? "Uncheck all" : "Check all"}
          </button>
        </div>
        <div className="divide-y divide-line">
          {items.map((it, i) => (
            <div key={it.title} className="px-5 py-3.5">
              <Checkbox
                checked={value.acks[i]}
                onChange={(e) => onChange({ ...value, acks: value.acks.map((a, j) => (j === i ? e.target.checked : a)) })}
                label={<span className="font-medium text-ink">{it.title}</span>}
                description={it.body}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Parent/guardian full name" htmlFor="gname">
          <Input id="gname" value={value.guardianName} onChange={(e) => onChange({ ...value, guardianName: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="Relationship to student" htmlFor="rel">
          <Input id="rel" value={value.relationship} onChange={(e) => onChange({ ...value, relationship: e.target.value })} placeholder="Mother, father, legal guardian…" />
        </Field>
        <Field label="Phone you’ll be reachable at during lessons" htmlFor="gphone" className="sm:col-span-2">
          <Input id="gphone" type="tel" inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} autoComplete="tel" />
        </Field>
      </div>
      <div className="rounded-2xl border border-dashed border-line-2 bg-paper-2/50 p-5">
        <Field label="Signature" htmlFor="sig" hint={`Type your full name exactly as above (“${value.guardianName || "your name"}”). This is your electronic signature.`}>
          <Input
            id="sig"
            value={value.signature}
            onChange={(e) => onChange({ ...value, signature: e.target.value })}
            className="h-14 font-serif text-2xl italic"
            autoComplete="off"
          />
        </Field>
        <p className="mt-3 text-xs text-muted">
          Read the full{" "}
          <Link href="/legal/consent" target="_blank" className="underline underline-offset-2">
            consent terms
          </Link>
          . We’ll email you a copy. You can withdraw consent anytime.
        </p>
      </div>
    </div>
  );
}
