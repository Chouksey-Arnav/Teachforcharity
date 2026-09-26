import { requireViewer } from "@/lib/viewer";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireViewer(["admin"]);
  return <>{children}</>;
}
