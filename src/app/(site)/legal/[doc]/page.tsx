import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, getLegalDoc } from "@/content/legal";
import { cn } from "@/lib/cn";
import { pageSeo } from "@/lib/seo/meta";
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { PageHero } from "@/components/site/page-hero";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  const d = getLegalDoc(doc);
  return d ? pageSeo(`/legal/${d.slug}`, d.title, d.summary) : {};
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const d = getLegalDoc(doc);
  if (!d) notFound();
  return (
    <>
      <JsonLd data={[webPageJsonLd({ path: `/legal/${d.slug}`, name: d.title, description: d.summary }), breadcrumbJsonLd([{ name: d.title, path: `/legal/${d.slug}` }])]} />
      <PageHero eyebrow="Policies" title={d.title} lead={d.summary}>
        <p className="lm-micro mt-6">
          Version {d.version} · Effective {d.effective}
        </p>
      </PageHero>
      <div className="lm-wrap grid grid-cols-[minmax(0,1fr)] gap-10 py-[clamp(40px,6vw,80px)] lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow mb-4 px-1">All policies</p>
          <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 lg:flex-col lg:overflow-visible" aria-label="Policies">
            {LEGAL_DOCS.map((x) => (
              <Link
                key={x.slug}
                href={`/legal/${x.slug}`}
                aria-current={x.slug === d.slug ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-2.5 text-sm transition",
                  x.slug === d.slug ? "bg-ink font-semibold text-cream" : "font-medium text-ink-2 hover:bg-white/80 hover:text-ink",
                )}
              >
                {x.title}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="min-w-0 max-w-3xl rounded-[26px] border border-ink/10 bg-white px-[clamp(20px,4vw,56px)] py-[clamp(28px,4vw,52px)] shadow-card">
          <div className="prose-legal [&>:first-child]:mt-0">{d.body}</div>
        </article>
      </div>
    </>
  );
}
