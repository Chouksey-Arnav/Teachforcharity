import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

// The landing page's type everywhere: Inter for text, Source Serif 4 for headlines, Geist Mono for labels.
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-source-serif", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — free music lessons across North Carolina`, template: `%s · ${SITE.name}` },
  description:
    "Free one-on-one band and orchestra lessons for North Carolina middle schoolers, taught over Google Meet by high school musicians earning verified volunteer hours.",
  openGraph: {
    title: SITE.name,
    description: SITE.tagline,
    type: "website",
    siteName: SITE.name,
  },
  robots: { index: true, follow: true },
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
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
