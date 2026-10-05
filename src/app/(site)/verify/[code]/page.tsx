import type { Metadata } from "next";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify volunteer hours", robots: { index: false, follow: false }, referrer: "no-referrer" };

interface Certificate {
  tutor_name: string;
  grade: number;
  school: string | null;
  status: string;
  instruments: string[];
  lessons: number;
  students: number;
  minutes: number;
  first_lesson: string | null;
  last_lesson: string | null;
  verifiers: string[];
  as_of: string;
}

const hours = (m: number) => (m / 60).toFixed(2).replace(/\.?0+$/, "") || "0";

/** Opened by a school or honor-society advisor from a tutor's printed record. */
export default async function VerifyHoursPage({ params }: PageProps<"/verify/[code]">) {
  const { code } = await params;
  const clean = decodeURIComponent(code).toLowerCase();
  const supabase = await createClient();
  const cert = /^[a-z2-9]{10}$/.test(clean) ? ((await supabase.rpc("hours_certificate", { p_code: clean })).data as unknown as Certificate | null) : null;

  if (!cert)
    return (
      <div className="lm-wash"><div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">Hours verification</p>
        <h1 className="display mt-3 text-4xl">We couldn’t find this record</h1>
        <p className="mt-3 text-muted">
          The link may be mistyped, or the tutor may have replaced or turned it off. Ask them for a current link{SITE.contactEmail ? `, or contact the program at ${SITE.contactEmail}` : ""}.
        </p>
      </div></div>
    );

  return (
    <div className="lm-wash"><div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <p className="eyebrow">Hours verification · {SITE.name}</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">{cert.tutor_name}</h1>
      <p className="mt-2 text-ink-2">
        {cert.grade}th grade{cert.school ? ` · ${cert.school}` : ""}
        {cert.instruments.length ? ` · Teaches ${cert.instruments.join(", ").toLowerCase()}` : ""}
      </p>

      <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4">
        {[
          [hours(cert.minutes), "verified hours"],
          [String(cert.lessons), cert.lessons === 1 ? "verified lesson" : "verified lessons"],
          [String(cert.students), cert.students === 1 ? "student taught" : "students taught"],
        ].map(([n, label]) => (
          <div key={label} className="rounded-2xl border border-line bg-card p-3 sm:p-5">
            <p className="display text-4xl sm:text-5xl">{n}</p>
            <p className="mt-1 text-xs text-muted sm:text-sm">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-2 rounded-2xl border border-line bg-card p-5 text-sm">
        {cert.first_lesson && cert.last_lesson && (
          <p>
            {formatDate(cert.first_lesson) === formatDate(cert.last_lesson) ? (
              <>
                Taught on <strong>{formatDate(cert.first_lesson)}</strong>.
              </>
            ) : (
              <>
                Lessons from <strong>{formatDate(cert.first_lesson)}</strong> to <strong>{formatDate(cert.last_lesson)}</strong>.
              </>
            )}
          </p>
        )}
        {cert.verifiers.length > 0 && <p>Verified by {cert.verifiers.map((v) => (v === "Program admin" ? "the program administrator" : v)).join(" and ")}.</p>}
        {cert.lessons === 0 && <p>No lessons have been verified yet.</p>}
        {cert.status !== "active" && <p className="text-muted">This tutor is not currently taking lessons with the program. The hours above were verified while they were.</p>}
        <p className="flex items-center gap-2 text-muted">
          <ShieldCheck className="size-4 shrink-0" aria-hidden /> Live from the program’s records as of {formatDate(cert.as_of)}.
        </p>
      </div>

      <p className="mt-6 flex gap-2 text-xs leading-relaxed text-muted">
        <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Only verified lessons count: each was logged by the tutor, confirmed by the student’s parent or guardian, and verified in a weekly review by the program’s nonprofit partner (or the program administrator). Whether these
        hours meet a school or honor-society requirement is up to that organization.
      </p>
    </div></div>
  );
}
