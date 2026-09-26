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
    <footer className="border-t border-line bg-paper-2/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            A student-led volunteer program. High school musicians teach middle schoolers for free, online, anywhere in {SITE.region}.
          </p>
          {SITE.contactEmail && (
            <p className="mt-4 text-sm">
              <a className="text-pine-700 underline-offset-4 hover:underline" href={`mailto:${SITE.contactEmail}`}>
                {SITE.contactEmail}
              </a>
            </p>
          )}
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h3 className="eyebrow text-muted!">{c.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ink-2 hover:text-pine-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs leading-relaxed text-faint sm:px-6 md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} {SITE.name}. Lessons are always free. We never collect or handle money.</p>
          <p>Not affiliated with or endorsed by any school or school district.</p>
        </div>
      </div>
    </footer>
  );
}
