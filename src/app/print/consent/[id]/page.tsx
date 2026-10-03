import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getFamilyStudents } from "@/lib/data";
import { PrintableConsent } from "@/components/legal/printable-consent";

export const metadata: Metadata = { title: "Consent form to sign", robots: { index: false, follow: false } };

/** A parent account's paper consent form for one of their students. */
export default async function PrintConsentPage({ params }: PageProps<"/print/consent/[id]">) {
  const viewer = await requireViewer(["family"]);
  if (viewer.profile.account_kind !== "parent") notFound();
  const { id } = await params;
  const supabase = await createClient();
  const students = await getFamilyStudents(supabase, viewer.id, await getPublicConfig());
  const s = students.find((x) => x.id === id);
  if (!s?.consent || s.consent.status !== "pending") notFound();
  return (
    <PrintableConsent
      studentName={s.first_name}
      guardianName={s.consent.guardian_name}
      relationship={s.consent.relationship}
      phone={s.consent.phone}
      signedAt={s.consent.signed_at}
      version={s.consent.version}
      code={s.consent.code}
    />
  );
}
