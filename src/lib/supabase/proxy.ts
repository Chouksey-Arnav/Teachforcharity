import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../database.types";

const PROTECTED = ["/dashboard", "/onboarding"];
const AUTH_PAGES = ["/login", "/signup"];

/** Refreshes the auth session on every request and guards private routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not put code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  // Admin pages: sign in on the admin page, remembering where they were headed
  // (e.g. a safety-alert email link). The page itself checks the admin role and two-factor.
  if (!signedIn && (path === "/admin" || path.startsWith("/admin/")) && path !== "/admin/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/admin/login";
    to.search = path === "/admin" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return copyCookies(response, NextResponse.redirect(to));
  }
  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return copyCookies(response, NextResponse.redirect(to));
  }
  if (signedIn && AUTH_PAGES.includes(path)) {
    const to = request.nextUrl.clone();
    to.pathname = "/dashboard";
    to.search = "";
    return copyCookies(response, NextResponse.redirect(to));
  }
  return response;
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  from.headers.forEach((v, k) => {
    if (k.toLowerCase() !== "set-cookie" && !to.headers.has(k)) to.headers.set(k, v);
  });
  return to;
}
