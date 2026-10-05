import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="p-[clamp(8px,1.2vw,18px)]">
      <div className="lm-sky lm-sky-dusk lm-panel flex min-h-[calc(100dvh-2*clamp(8px,1.2vw,18px))] flex-col items-center justify-center px-4 py-16 text-center">
        <Logo />
        <p className="lm-eyebrow mt-14">Error 404</p>
        <h1 className="lm-h1 mt-5 text-ink">
          That page <em>isn’t here.</em>
        </h1>
        <p className="lm-sub mx-auto mt-5 max-w-md">The link may be old or mistyped. Here are the places people usually want to go.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-2.5">
          <LinkButton href="/dashboard" size="lg">
            Your dashboard
          </LinkButton>
          <LinkButton href="/" variant="secondary" size="lg">
            Home page
          </LinkButton>
          <LinkButton href="/how-it-works" variant="ghost" size="lg">
            How it works
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
