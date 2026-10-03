"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SITE_NAV } from "./nav-links";


export function MobileNav({ signedIn }: { signedIn: boolean }) {
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
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-paper-2"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-50 animate-fade overflow-y-auto border-t border-ink/10 bg-[#f8f6ee] px-4 pb-10 pt-4">
          <nav className="flex flex-col" aria-label="Mobile">
            {SITE_NAV.map((l) => (
              <Link key={l.href} href={l.href} className="border-b border-ink/10 py-4 font-serif text-3xl text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 flex flex-col gap-3">
            {signedIn ? (
              <Link href="/dashboard" className="lm-btn lm-btn-ink">
                Go to dashboard
              </Link>
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
