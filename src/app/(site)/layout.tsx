import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { getPublicConfig, getViewer } from "@/lib/viewer";
import { siteAccount } from "@/components/site/account";
import { siteNav } from "@/components/site/nav-links";
import { causeReady } from "@/lib/cause";
import { Reveal } from "@/components/landing/reveal";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [viewer, config] = await Promise.all([getViewer(), getPublicConfig()]);
  const showCause = causeReady(config);
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <SiteHeader account={viewer ? siteAccount(viewer) : null} nav={siteNav(showCause)} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter showCause={showCause} />
      <Reveal />
    </div>
  );
}
