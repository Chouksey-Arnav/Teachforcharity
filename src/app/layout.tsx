import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { SITE } from "@/lib/site";
import { JsonLd, siteGraph } from "@/lib/seo/json-ld";
import "./globals.css";

// The landing page's type everywhere: Inter for text, Source Serif 4 for headlines, Geist Mono for labels.
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-source-serif", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — free music lessons across North Carolina`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  category: "education",
  openGraph: {
    title: `${SITE.name} — free music lessons across North Carolina`,
    description: SITE.tagline,
    type: "website",
    siteName: SITE.name,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.tagline },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  // Search Console and Bing Webmaster Tools ownership tags; set the env vars once the owner has the codes (docs/SEO.md).
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : undefined,
  },
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F8F6EE",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <JsonLd data={siteGraph()} />
        {children}
      </body>
    </html>
  );
}
