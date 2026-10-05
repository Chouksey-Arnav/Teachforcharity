import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { getViewer } from "@/lib/viewer";
import { siteAccount } from "@/components/site/account";
import { Reveal } from "@/components/landing/reveal";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <SiteHeader account={viewer ? siteAccount(viewer) : null} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <Reveal />
    </div>
  );
}
