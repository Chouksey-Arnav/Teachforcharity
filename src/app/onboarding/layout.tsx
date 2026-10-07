import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lm-wash min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink/[0.08] bg-cream/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6 md:h-[72px]">
          <Logo href="/" />
          <form action={signOut}>
            <button className="lm-btn lm-btn-glass lm-btn-sm">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-14">{children}</main>
    </div>
  );
}
