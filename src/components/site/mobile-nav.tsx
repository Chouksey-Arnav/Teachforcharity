"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/app/actions/auth";
import type { NavLink } from "./nav-links";
import type { SiteAccount } from "./account";

export function MobileNav({ account, nav }: { account: SiteAccount | null; nav: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1 lg:hidden">
      {/* Always one tap from the top bar on a phone: your account, or signing in. */}
      {account ? (
        <Link
          href={account.href}
          className="lm-account-dot inline-flex size-10 items-center justify-center rounded-full md:hidden"
          aria-label={`${account.cta} (signed in as ${account.name})`}
        >
          <Avatar name={account.name} path={account.avatarPath} size={32} />
        </Link>
      ) : (
        <Link href="/login" className="rounded-full px-3 py-2 text-[15px] font-medium text-ink md:hidden">
          Sign in
        </Link>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-paper-2"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <div id="site-menu" className="fixed inset-x-0 top-16 bottom-0 z-50 animate-fade overflow-y-auto border-t border-ink/10 bg-[#f8f6ee] px-4 pb-10 pt-4 md:top-[72px]">
          {account && (
            <Link href={account.href} className="mb-4 flex items-center gap-3 rounded-2xl border border-ink/10 bg-white p-3.5">
              <Avatar name={account.name} path={account.avatarPath} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{account.name}</span>
                <span className="block truncate text-sm text-ink/60">{account.roleLabel} · signed in</span>
              </span>
              <ArrowRight className="size-4 text-ink/60" />
            </Link>
          )}
          <nav className="flex flex-col" aria-label="Mobile">
            {nav.map((l) => (
              <Link key={l.href} href={l.href} className="border-b border-ink/10 py-4 font-serif text-3xl text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 flex flex-col gap-3">
            {account ? (
              <>
                <Link href={account.href} className="lm-btn lm-btn-ink">
                  {account.go} <ArrowRight className="size-4" />
                </Link>
                <form action={signOut} className="contents">
                  <button className="lm-btn lm-btn-glass">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/signup" className="lm-btn lm-btn-ink">
                  Get started — it’s free
                </Link>
                <Link href="/login" className="lm-btn lm-btn-glass">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
