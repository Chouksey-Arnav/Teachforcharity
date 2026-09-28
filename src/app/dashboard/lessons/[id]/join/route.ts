import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeMeetUrl } from "@/lib/meet";

/**
 * "Join Google Meet": a form POST (target=_blank, so it's never blocked as a
 * pop-up) that asks the database for the lesson's Meet link. The database
 * only returns it during the lesson window, for the lesson's tutor or family,
 * and records their "a parent is nearby" / "I won't record" confirmation.
 * The link itself never appears in a page, an email or a calendar invite.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/dashboard/lessons/[id]/join">) {
  const { id } = await ctx.params;
  const back = (code: string) => NextResponse.redirect(new URL(`/dashboard/lessons?focus=${encodeURIComponent(id)}&join=${code}`, request.url), 303);

  // Only accept this form from our own pages.
  let sameOrigin = false;
  try {
    sameOrigin = new URL(request.headers.get("origin") ?? "").host === request.nextUrl.host;
  } catch {
    // missing or "null" origin
  }
  if (!sameOrigin) return new NextResponse("Forbidden", { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return back("NOT_FOUND");

  const form = await request.formData();
  if (form.get("ack") !== "on") return back("NO_ACK");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_lesson", { p_session: id });
  if (error) return back(/^[A-Z_]+$/.test(error.hint ?? "") ? error.hint! : "ERROR");
  const url = normalizeMeetUrl(String(data ?? ""));
  if (!url) return back("ERROR");
  return NextResponse.redirect(url, 303);
}
