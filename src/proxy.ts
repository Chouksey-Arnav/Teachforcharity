import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|llms.txt|llms-full.txt|opengraph-image|twitter-image|[a-f0-9]{32}\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
