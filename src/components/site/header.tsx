import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { MobileNav } from "./mobile-nav";
import { HeaderShell } from "./header-shell";
import { SITE_NAV } from "./nav-links";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <HeaderShell>
      <div className="lm-wrap flex h-16 items-center justify-between gap-6 md:h-[72px]">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {SITE_NAV.map((l) => (
            <Link key={l.href} href={l.href} className="text-[15px] text-ink/80 transition-colors duration-200 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-4 md:flex">
          {signedIn ? (
            <Link href="/dashboard" className="lm-btn lm-btn-ink lm-btn-sm">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-[15px] text-ink/80 transition-colors hover:text-ink">
                Sign in
              </Link>
              <Link href="/signup" className="lm-btn lm-btn-ink lm-btn-sm">
                Get started
              </Link>
            </>
          )}
        </div>
        <MobileNav signedIn={signedIn} />
      </div>
    </HeaderShell>
  );
}
