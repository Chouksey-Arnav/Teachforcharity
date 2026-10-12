import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const body = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) });

/**
 * Marks updates read when one is tapped. Called with navigator.sendBeacon so
 * the tap goes straight to its page; the database only touches the caller's
 * own updates.
 */
export async function POST(request: NextRequest) {
  // Only from our own pages.
  let sameOrigin = false;
  try {
    sameOrigin = new URL(request.headers.get("origin") ?? "").host === request.nextUrl.host;
  } catch {
    // missing or "null" origin
  }
  if (!sameOrigin) return new NextResponse(null, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_updates_read", { p_ids: parsed.data.ids });
  return new NextResponse(null, { status: error ? 500 : 204 });
}
