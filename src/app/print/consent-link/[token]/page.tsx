import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintableConsent } from "@/components/legal/printable-consent";

export const metadata: Metadata = {
  title: "Consent form to sign",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface View {
  student: { first_name: string };
  consent: {
    signed_at: string;
    guardian_name: string;
    relationship: string;
    phone: string;
    version: string;
    verification_status: string;
    verification_code: string;
  } | null;
}

/** The paper consent form for a parent using their private link (older student accounts). */
export default async function PrintConsentLinkPage({ params }: PageProps<"/print/consent-link/[token]">) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("guardian_view", { p_token: token });
  const d = data as View | null;
  if (!d?.consent || d.consent.verification_status !== "pending") notFound();
  return (
    <PrintableConsent
      studentName={d.student.first_name}
      guardianName={d.consent.guardian_name}
      relationship={d.consent.relationship}
      phone={d.consent.phone}
      signedAt={d.consent.signed_at}
      version={d.consent.version}
      code={d.consent.verification_code}
    />
  );
}
