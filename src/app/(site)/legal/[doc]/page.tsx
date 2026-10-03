import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, getLegalDoc } from "@/content/legal";
import { cn } from "@/lib/cn";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  const d = getLegalDoc(doc);
  return d ? { title: d.title, description: d.summary } : {};
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const d = getLegalDoc(doc);
  if (!d) notFound();
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow mb-4">Policies</p>
        <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label="Policies">
          {LEGAL_DOCS.map((x) => (
            <Link
              key={x.slug}
              href={`/legal/${x.slug}`}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm transition",
                x.slug === d.slug ? "bg-card font-medium text-ink ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {x.title}
            </Link>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 max-w-3xl">
        <h1 className="display text-5xl sm:text-6xl">{d.title}</h1>
        <p className="mt-3 text-sm text-muted">
          Version {d.version} · Effective {d.effective}
          {d.updated ? ` · Updated ${d.updated}` : ""}
        </p>
        <div className="prose-legal mt-10">{d.body}</div>
      </article>
    </div>
  );
}
