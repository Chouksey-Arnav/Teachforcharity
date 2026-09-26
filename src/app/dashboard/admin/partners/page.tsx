import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Notice } from "@/components/ui/notice";
import { PartnerEditor } from "./partner-editor";

export const metadata: Metadata = { title: "Partner & cause · Admin" };

export default async function AdminPartnersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("partners").select("*").order("is_current", { ascending: false }).order("created_at");
  return (
    <>
      <PageHeader title="Partner & cause" description="Controls the “current cause” shown across the site and the donation link-out. The site never handles money." />
      <Notice tone="info" className="mb-6">
        Leave “Partnership confirmed” off until the nonprofit formally agrees — the site then avoids calling them an official partner. Only add a
        donation link the nonprofit has given you, and it must be their own donation page.
      </Notice>
      <PartnerEditor partners={data ?? []} />
    </>
  );
}
