import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SITE } from "@/lib/site";

function cols(showCause: boolean) {
  return [
    {
      title: "Program",
      links: [
        { href: "/how-it-works", label: "How it works" },
        { href: "/safety", label: "Safety & consent" },
        { href: "/volunteer", label: "Become a tutor" },
        { href: "/faq", label: "Questions" },
        ...(showCause ? [{ href: "/cause", label: "The cause" }] : []),
      ],
    },
    {
      title: "Talk to us",
      links: [
        { href: "/about", label: "Who runs this" },
        { href: "/contact", label: "Contact us" },
        { href: "/contact?topic=concern", label: "Report a concern" },
        { href: "/waitlist", label: "Join the waitlist" },
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
}

export function SiteFooter({ showCause }: { showCause: boolean }) {
  return (
    <footer className="relative overflow-hidden bg-[#16201c] text-[#f8f6ee]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ background: "var(--lm-grain)" }} />
      <div className="lm-wrap relative grid gap-12 pb-12 pt-16 sm:pt-20 sm:grid-cols-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="max-w-sm sm:col-span-3 md:col-span-1">
          <Logo inverted />
          <p className="mt-5 font-mono text-[11.5px] uppercase tracking-[0.2em] text-[#e2c37e]/80">Free lessons · Real hours</p>
          <p className="mt-5 text-[15px] leading-relaxed text-[#f8f6ee]/70">
            A student-led volunteer program. High school musicians teach middle schoolers for free, online, anywhere in {SITE.region}.
          </p>
          <p className="mt-5">
            <Link href="/contact" className="lm-btn lm-btn-glow lm-btn-sm">
              Contact the program team
            </Link>
          </p>
          {SITE.contactEmail && (
            <p className="mt-3 text-[13.5px] text-[#f8f6ee]/60">
              or email{" "}
              <a className="text-[#f8f6ee]/85 underline-offset-4 transition-colors hover:text-[#f4d36f] hover:underline" href={`mailto:${SITE.contactEmail}`}>
                {SITE.contactEmail}
              </a>
            </p>
          )}
        </div>
        {cols(showCause).map((c) => (
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
