import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin/cookie";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Admin pages without an admin session: send to sign-in, remembering where they were
  // headed (e.g. a safety-alert email link), so they land there after signing in.
  // The page itself still verifies the cookie's signature.
  const path = request.nextUrl.pathname;
  if ((path === "/admin" || path.startsWith("/admin/")) && path !== "/admin/login" && !request.cookies.has(ADMIN_COOKIE)) {
    const to = request.nextUrl.clone();
    to.pathname = "/admin/login";
    to.search = path === "/admin" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(to);
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
