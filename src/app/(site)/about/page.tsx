import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Ban, HandCoins, MessageSquareLock, School, ShieldCheck, Siren } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ClosingCta, PageHero, SectionHead } from "@/components/site/page-hero";
import { FOUNDER, TEAM, type Person } from "@/content/about";
import { confirmedPartner } from "@/lib/cause";
import { getPublicConfig } from "@/lib/viewer";
import { SITE } from "@/lib/site";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { cn } from "@/lib/cn";

const DESCRIPTION = "Who runs Teach for a Cause, why it exists, the rules we hold ourselves to, and how to reach the program team or report a concern.";
export const metadata: Metadata = pageSeo("/about", "About", DESCRIPTION, { ownImage: true });

const LINK = "font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink";
const TONES = ["bg-mint", "bg-peach", "bg-lilac", "bg-glow"];

/** What we promise about how the program itself is run. Each is enforced somewhere a parent can check. */
const COMMITMENTS: { icon: typeof Ban; t: string; d: React.ReactNode }[] = [
  { icon: HandCoins, t: "No money, in any direction", d: "Lessons are free. Nobody pays us, we pay nobody, and tutors can’t accept money or gifts." },
  { icon: ShieldCheck, t: "A parent says yes first", d: "Students can’t make accounts. A parent creates one from an email we verify and signs consent before anything unlocks." },
  { icon: MessageSquareLock, t: "Parents can read everything", d: "Every message between a tutor and a student is readable from the parent’s account. Contact details are blocked." },
  {
    icon: Ban,
    t: "We collect as little as we can",
    d: (
      <>
        A student’s first name, never a last name or photo. Nothing is sold or used for ads.{" "}
        <Link href="/legal/privacy" className={LINK}>
          Privacy policy
        </Link>
      </>
    ),
  },
  { icon: School, t: "Independent", d: "We’re not affiliated with or endorsed by any school or school district." },
  {
    icon: Siren,
    t: "Concerns go to a person",
    d: (
      <>
        Anyone can reach the program team, account or not.{" "}
        <Link href="/contact?topic=concern" className={LINK}>
          Report a concern
        </Link>
      </>
    ),
  },
];

export default async function AboutPage() {
  const partner = confirmedPartner(await getPublicConfig());
  return (
    <>
      <JsonLd data={[webPageJsonLd({ path: "/about", name: "About", description: DESCRIPTION, type: "AboutPage" }), breadcrumbJsonLd([{ name: "About", path: "/about" }])]} />
      <PageHero
        sky="dusk"
        eyebrow="About us"
        title={
          <>
            Run by students. <em>Answerable to parents.</em>
          </>
        }
        lead={`${SITE.name} is a student-led volunteer program in ${SITE.region}. High school musicians teach middle schoolers one-on-one, for free, with a parent in charge from the first click.`}
      />

      {FOUNDER && (
        <section className="lm-wrap py-[clamp(56px,7vw,96px)]">
          <SectionHead eyebrow="Who started it" title={<>Why this <em>exists.</em></>} className="mb-12" />
          <PersonCard person={FOUNDER} lead />
          {TEAM.length > 0 && (
            <div className="mx-auto mt-6 grid max-w-[920px] gap-4 sm:grid-cols-2">
              {TEAM.map((p) => (
                <PersonCard key={p.name} person={p} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className={cn("lm-wrap", FOUNDER ? "pb-[clamp(56px,7vw,96px)]" : "py-[clamp(56px,7vw,96px)]")}>
        <SectionHead
          eyebrow="How it’s run"
          title={
            <>
              Six rules we hold <em>ourselves</em> to.
            </>
          }
          lead="Not a mission statement. Each of these is built into the site or written into our policies, so you can check it."
          className="mb-12"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMMITMENTS.map(({ icon: Icon, t, d }, n) => (
            <div key={t} className={cn("rv rounded-[22px] border border-ink/10 bg-white p-6 shadow-card", n % 3 === 1 && "rv-d1", n % 3 === 2 && "rv-d2")}>
              <span className={cn("flex size-11 items-center justify-center rounded-[13px] text-ink", TONES[n % TONES.length])}>
                <Icon className="size-5" strokeWidth={1.8} aria-hidden />
              </span>
              <h3 className="mt-5 text-[16.5px] font-semibold tracking-[-0.01em] text-ink">{t}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {partner && (
        <section className="mx-auto w-[min(920px,100%-2*clamp(16px,3vw,40px))] pb-[clamp(56px,7vw,96px)]">
          <div className="rv lm-sky lm-sky-gold lm-panel p-[clamp(24px,4vw,44px)]">
            <p className="lm-eyebrow">Our nonprofit partner</p>
            <h2 className="lm-h3 mt-4 text-ink">{partner.name}</h2>
            <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-ink-2">
              {partner.short_name} reviews confirmed lessons each week and verifies tutors’ volunteer hours. They’re a separate organization; we don’t
              handle money for them or anyone else.
            </p>
            {partner.website_url && (
              <a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="lm-btn lm-btn-ink lm-btn-sm mt-6">
                Visit {partner.short_name}’s website <ArrowUpRight className="size-4" />
              </a>
            )}
          </div>
        </section>
      )}

      <section className="mx-auto w-[min(920px,100%-2*clamp(16px,3vw,40px))] pb-[clamp(56px,7vw,96px)]">
        <div className="rv grid gap-6 rounded-[28px] border border-ink/10 bg-white p-[clamp(24px,4vw,40px)] shadow-card sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="eyebrow">Talk to a person</p>
            <h2 className="display mt-3 text-[clamp(26px,3vw,34px)]">
              Questions before you sign up? <em>Ask us.</em>
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              The contact form reaches the program team directly, no account needed.
              {SITE.contactEmail && (
                <>
                  {" "}
                  Or email <a className={LINK} href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:items-end">
            <Link href="/contact" className="lm-btn lm-btn-ink lm-btn-sm">
              Contact us <ArrowRight className="size-4" />
            </Link>
            <Link href="/contact?topic=concern" className="lm-btn lm-btn-glass lm-btn-sm">
              Report a concern
            </Link>
          </div>
        </div>
      </section>

      <ClosingCta
        eyebrow="See how it works"
        title={
          <>
            Read the rules, <em>then decide.</em>
          </>
        }
        lead="Everything that happens between signing up and a first lesson, and every safety rule, in plain words."
        micro="Free · Online · Never recorded"
      >
        <Link href="/how-it-works" className="lm-btn lm-btn-ink">
          How it works <ArrowRight className="size-4" />
        </Link>
        <Link href="/safety" className="lm-btn lm-btn-glass">
          Safety &amp; consent
        </Link>
      </ClosingCta>
    </>
  );
}

function PersonCard({ person, lead }: { person: Person; lead?: boolean }) {
  return (
    <figure className={cn("rv mx-auto grid gap-6 rounded-[28px] border border-ink/10 bg-white p-[clamp(22px,3.5vw,36px)] shadow-card", lead ? "max-w-[920px] sm:grid-cols-[auto_1fr]" : "")}>
      {person.photo ? (
        <Image src={person.photo} alt={person.name} width={lead ? 160 : 72} height={lead ? 160 : 72} className={cn("rounded-[22px] object-cover", lead ? "size-28 sm:size-40" : "size-[72px]")} />
      ) : (
        <Avatar name={person.name} size={lead ? 112 : 64} />
      )}
      <div>
        <blockquote className={cn(lead ? "display text-[clamp(22px,2.6vw,28px)] leading-snug" : "text-[15.5px] leading-relaxed", "text-ink")}>“{person.note}”</blockquote>
        <figcaption className="mt-4">
          <span className="block font-semibold text-ink">{person.name}</span>
          <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-pine-700">{person.role}</span>
        </figcaption>
      </div>
    </figure>
  );
}
