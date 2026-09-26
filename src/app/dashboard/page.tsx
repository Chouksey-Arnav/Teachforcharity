import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { FamilyHome } from "./_homes/family-home";
import { TutorHome } from "./_homes/tutor-home";
import { ReviewerHome } from "./_homes/reviewer-home";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardHome({ searchParams }: PageProps<"/dashboard">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  if (viewer.role === "family") return <FamilyHome viewer={viewer} welcome={sp.welcome === "1"} />;
  if (viewer.role === "tutor") return <TutorHome viewer={viewer} passwordUpdated={sp.password === "updated"} />;
  if (viewer.role === "reviewer") return <ReviewerHome viewer={viewer} />;
  redirect("/admin");
}
