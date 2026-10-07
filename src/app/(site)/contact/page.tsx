import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, MailCheck, ShieldCheck } from "lucide-react";
import { ContactForm } from "@/components/site/contact-form";
import { PageHero } from "@/components/site/page-hero";
import { CONTACT_TOPICS, type ContactTopic } from "@/lib/public-forms";
import { getViewer } from "@/lib/viewer";
import { SITE } from "@/lib/site";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";

const DESCRIPTION = "Reach the Teach for a Cause program team with a question, or report a concern about a lesson or a tutor. No account needed.";
export const metadata: Metadata = pageSeo("/contact", "Contact", DESCRIPTION, { ownImage: true });

const LINK = "font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink";

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const topic: ContactTopic = CONTACT_TOPICS.some((t) => t.key === sp.topic) ? (sp.topic as ContactTopic) : "question";
  return (
    <>
      <JsonLd data={[webPageJsonLd({ path: "/contact", name: "Contact", description: DESCRIPTION }), breadcrumbJsonLd([{ name: "Contact", path: "/contact" }])]} />
      <PageHero
        eyebrow="Contact"
        title={
          topic === "concern" ? (
            <>
              Report a concern. <em>We act on every one.</em>
            </>
          ) : (
            <>
              Questions or a concern? <em>Reach a person.</em>
            </>
          )
        }
        lead="This goes straight to the program team. No account needed."
      />
      <section className="lm-wrap grid gap-10 py-[clamp(48px,7vw,96px)] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="rv rounded-[28px] border border-ink/10 bg-white p-[clamp(20px,3.5vw,40px)] shadow-card">
          <ContactForm
            initialTopic={topic}
            signedIn={Boolean(viewer)}
            defaults={{ name: viewer?.profile.full_name ?? "", email: viewer?.email ?? "" }}
          />
        </div>
        <aside className="rv rv-d1 space-y-4 self-start">
          {[
            { icon: Clock3, t: "When you’ll hear back", d: "Usually within a couple of days. Concerns are flagged to the team as urgent." },
            { icon: ShieldCheck, t: "Who sees it", d: "Only the program team. Never a tutor or another family." },
            {
              icon: MailCheck,
              t: "Prefer email?",
              d: SITE.contactEmail ? (
                <a className={LINK} href={`mailto:${SITE.contactEmail}`}>
                  {SITE.contactEmail}
                </a>
              ) : (
                "Use this form; it reaches the same people."
              ),
            },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-[22px] bg-paper-2 p-5">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Icon className="size-4 text-pine-700" aria-hidden /> {t}
              </p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
          <p className="px-1 text-[14px] leading-relaxed text-muted">
            Looking for a quick answer? <Link href="/faq" className={LINK}>Read the FAQ</Link>. Want to know who runs this?{" "}
            <Link href="/about" className={LINK}>About us</Link>.
          </p>
        </aside>
      </section>
    </>
  );
}
