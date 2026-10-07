import { FAQ_ITEMS } from "@/components/site/sections";
import { PUBLIC_PAGES } from "@/lib/seo/pages";
import { SITE } from "@/lib/site";

const link = (path: string) => (path === "/" ? SITE.url : `${SITE.url}${path}`);

const FACTS = [
  "Lessons are free for families, always. There is no fee and no payment information anywhere on the site.",
  "Tutors are high school students (grades 9–12) who play band or orchestra instruments. They are volunteers, not certified teachers.",
  "Students are middle schoolers in North Carolina. A parent or guardian creates the account, adds the child and signs consent before any lesson.",
  "Lessons are one-on-one over Google Meet, never recorded, with a parent home or nearby.",
  "Messages inside the site are filtered and scanned; phone numbers, emails, links and social media are blocked, and parents can read every message.",
  "Tutors earn volunteer hours that are logged by the tutor, confirmed by the family and certified weekly by a partner nonprofit.",
  "Donating to the partner nonprofit's cause is optional and happens on the nonprofit's own site.",
];

/** /llms.txt: a short, curated map for language-model crawlers (https://llmstxt.org). */
export function llmsTxt(): string {
  return [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    "## Key facts",
    ...FACTS.map((f) => `- ${f}`),
    "",
    "## Pages",
    ...PUBLIC_PAGES.map((p) => `- [${p.title}](${link(p.path)}): ${p.summary}`),
    "",
    "## Optional",
    `- [Full text for AI assistants](${SITE.url}/llms-full.txt): the key facts and every frequently asked question, in one file.`,
    `- [Sitemap](${SITE.url}/sitemap.xml)`,
    "",
  ].join("\n");
}

/** /llms-full.txt: the same facts plus every FAQ answer, so an assistant can answer without crawling the site. */
export function llmsFullTxt(): string {
  return [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `Website: ${SITE.url}`,
    `Region served: ${SITE.region}`,
    "",
    "## Key facts",
    ...FACTS.map((f) => `- ${f}`),
    "",
    "## Frequently asked questions",
    "",
    ...FAQ_ITEMS.flatMap((i) => [`### ${i.q}`, "", i.a, ""]),
    "## Pages",
    ...PUBLIC_PAGES.map((p) => `- [${p.title}](${link(p.path)}): ${p.summary}`),
    "",
  ].join("\n");
}

export function textResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
