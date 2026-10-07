import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Signed-in areas and one-time token links must never be indexed, even if a crawler finds a link to them.
const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
const PRIVATE_SOURCES = ["/dashboard/:path*", "/admin/:path*", "/onboarding/:path*", "/api/:path*", "/auth/:path*", "/invite/:path*", "/confirm/:path*", "/verify/:path*", "/guardian/:path*"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...PRIVATE_SOURCES.map((source) => ({ source, headers: noIndex })),
      {
        // The service worker must always be re-fetched so fixes reach every device.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
