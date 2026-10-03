import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";

const COLS = [
  {
    title: "Program",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/safety", label: "Safety & consent" },
      { href: "/volunteer", label: "Become a tutor" },
      { href: "/cause", label: "The cause" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/consent", label: "Parent consent" },
      { href: "/legal/messaging", label: "Messaging guidelines" },
      { href: "/legal/tutor-agreement", label: "Tutor agreement" },
      { href: "/legal/code-of-conduct", label: "Code of conduct" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#16201c] text-[#f8f6ee]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ background: "var(--lm-grain)" }} />
      <div className="lm-wrap relative grid gap-12 pb-12 pt-16 sm:pt-20 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo inverted />
          <p className="mt-5 font-mono text-[11.5px] uppercase tracking-[0.2em] text-[#e2c37e]/80">Free lessons · Real hours</p>
          <p className="mt-5 text-[15px] leading-relaxed text-[#f8f6ee]/70">
            A student-led volunteer program. High school musicians teach middle schoolers for free, online, anywhere in {SITE.region}.
          </p>
          {SITE.contactEmail && (
            <p className="mt-4 text-[15px]">
              <a className="text-[#f8f6ee] underline-offset-4 transition-colors hover:text-[#f4d36f] hover:underline" href={`mailto:${SITE.contactEmail}`}>
                {SITE.contactEmail}
              </a>
            </p>
          )}
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h3 className="font-mono text-[11.5px] font-medium uppercase tracking-[0.18em] text-[#f8f6ee]/50">{c.title}</h3>
            <ul className="mt-4 space-y-1">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-block py-1 text-[15px] text-[#f8f6ee]/85 transition-colors duration-200 hover:text-[#f4d36f]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="lm-wrap relative flex flex-col gap-3 border-t border-[#f8f6ee]/12 py-7 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[#f8f6ee]/50 md:flex-row md:justify-between md:gap-10">
        <p>
          © {new Date().getFullYear()} {SITE.name} · Lessons are always free · We never handle money
        </p>
        <p className="font-sans text-[12.5px] normal-case tracking-normal md:max-w-xl md:text-right">
          Not affiliated with or endorsed by any school or school district. Photos are public-domain (CC0) stock images; the people pictured aren’t
          program participants.
        </p>
      </div>
    </footer>
  );
}
