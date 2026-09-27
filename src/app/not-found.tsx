import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="eyebrow mt-12">404</p>
      <h1 className="display mt-3 text-5xl">That page isn’t here</h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">The link may be old or mistyped. Here are the places people usually want to go.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <LinkButton href="/dashboard">Your dashboard</LinkButton>
        <LinkButton href="/" variant="secondary">
          Home page
        </LinkButton>
        <LinkButton href="/how-it-works" variant="ghost">
          How it works
        </LinkButton>
      </div>
    </main>
  );
}
