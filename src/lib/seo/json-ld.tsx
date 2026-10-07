import { SITE } from "@/lib/site";

type JsonLdNode = Record<string, unknown>;

/** Renders schema.org structured data. `<` is escaped so page text can never close the script tag. */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export const abs = (path: string) => `${SITE.url}${path === "/" ? "" : path}`;

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;

/** Who we are and who we serve. Only facts the site already states: no invented address, phone or social profiles. */
export function siteGraph(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: SITE.name,
        url: SITE.url,
        logo: { "@type": "ImageObject", url: `${SITE.url}/icon-512.png`, width: 512, height: 512 },
        description: SITE.description,
        areaServed: { "@type": "State", name: SITE.region },
        slogan: SITE.tagline,
        ...(SITE.contactEmail ? { email: SITE.contactEmail } : {}),
      },
      {
        "@type": "WebSite",
        "@id": SITE_ID,
        url: SITE.url,
        name: SITE.name,
        description: SITE.description,
        inLanguage: "en-US",
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

export function faqJsonLd(items: readonly { q: string; a: string }[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: abs(t.path),
    })),
  };
}

export function webPageJsonLd(opts: { path: string; name: string; description: string; type?: "WebPage" | "AboutPage" | "FAQPage" }): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${abs(opts.path)}#webpage`,
    url: abs(opts.path),
    name: opts.name,
    description: opts.description,
    inLanguage: "en-US",
    isPartOf: { "@id": SITE_ID },
    about: { "@id": ORG_ID },
  };
}
