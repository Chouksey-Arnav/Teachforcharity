import { getLegalDoc } from "@/content/legal";
import { SITE } from "@/lib/site";
import { formatDate } from "@/lib/time";
import { PrintButton } from "./print-button";

export interface PrintableConsentProps {
  studentName: string;
  guardianName: string;
  relationship: string;
  phone: string;
  signedAt: string;
  version: string;
  code: string;
}

const Line = ({ label, wide }: { label: string; wide?: boolean }) => (
  <div className={wide ? "sm:col-span-2" : undefined}>
    <div className="h-10 border-b border-ink" />
    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">{label}</p>
  </div>
);

/**
 * The paper copy of a parent's consent: the full consent terms, what they
 * signed online, and blank lines for an ink signature. The verification code
 * ties the paper to this one signature.
 */
export function PrintableConsent(p: PrintableConsentProps) {
  const doc = getLegalDoc("consent")!;
  return (
    <div className="mx-auto max-w-3xl bg-white px-6 py-8 text-ink print:max-w-none print:p-0">
      <div className="no-print mb-6 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-2">
        <p className="font-semibold text-ink">How to use this form</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Print it (or save it as a PDF and print it elsewhere).</li>
          <li>Sign and date the last section by hand, in ink. Don’t change anything else.</li>
          <li>Take a photo of the signature page, with the code visible, and upload it on the site.</li>
        </ol>
        <PrintButton className="mt-3" />
      </div>

      <header className="flex items-start justify-between gap-6 border-b border-ink pb-4">
        <div>
          <p className="font-serif text-lg italic">{SITE.name}</p>
          <h1 className="mt-1 text-2xl font-semibold">Parent/Guardian Consent</h1>
          <p className="text-xs text-muted">
            Form version {p.version} · for {p.studentName}
          </p>
        </div>
        <div className="shrink-0 rounded-lg border-2 border-ink px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-widest">Verification code</p>
          <p className="font-mono text-xl font-bold tracking-[0.2em]">{p.code}</p>
        </div>
      </header>

      <div className="prose-legal mt-5 text-[13px] print:text-[11px] [&_h2]:mt-4 [&_h2]:text-lg [&_li]:text-[13px] [&_p]:text-[13px] print:[&_li]:text-[11px] print:[&_p]:text-[11px]">
        {doc.body}
      </div>

      <section className="mt-6 break-inside-avoid rounded-lg border-2 border-ink p-5">
        <h2 className="text-base font-semibold">Signature</h2>
        <p className="mt-2 text-[13px] leading-relaxed">
          I, <strong>{p.guardianName}</strong>, am <strong>{p.studentName}</strong>’s {p.relationship.toLowerCase()}, I am 18 or older, and I
          am the parent or legal guardian who signed this consent online on {formatDate(p.signedAt)} (reachable at {p.phone}). I have read
          the consent above and I agree to it. I understand that signing for a child I am not the parent or legal guardian of is not allowed.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <Line label="Signature (by hand, in ink)" wide />
          <Line label="Printed name" />
          <Line label="Date" />
        </div>
        <p className="mt-4 text-[11px] text-muted">
          Verification code <strong className="font-mono text-ink">{p.code}</strong> must be visible in your photo. Don’t attach or photograph an
          ID or anything else. Only program administrators see this photo; it is deleted one year after this consent is withdrawn or replaced.
        </p>
      </section>
    </div>
  );
}
