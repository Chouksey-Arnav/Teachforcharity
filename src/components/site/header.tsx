import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { MobileNav } from "./mobile-nav";
import { HeaderShell } from "./header-shell";
import { SITE_NAV } from "./nav-links";
import type { SiteAccount } from "./account";

export function SiteHeader({ account }: { account: SiteAccount | null }) {
  return (
    <HeaderShell>
      <div className="lm-wrap flex h-16 items-center justify-between gap-6 md:h-[72px]">
        <Logo />
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {SITE_NAV.map((l) => (
            <Link key={l.href} href={l.href} className="text-[15px] text-ink/80 transition-colors duration-200 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-4 md:flex lg:ml-0">
          {account ? (
            <Link href={account.href} className="lm-btn lm-btn-ink lm-btn-sm lm-account" title={`Signed in as ${account.name}`}>
              <Avatar name={account.name} path={account.avatarPath} size={28} />
              {account.cta}
              <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-[15px] font-medium text-ink/80 transition-colors hover:text-ink">
                Sign in
              </Link>
              <Link href="/signup" className="lm-btn lm-btn-ink lm-btn-sm">
                Get started
              </Link>
            </>
          )}
        </div>
        <MobileNav account={account} />
      </div>
    </HeaderShell>
  );
}
