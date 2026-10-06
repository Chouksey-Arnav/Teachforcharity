import { NextResponse, type NextRequest } from "next/server";
import { runAccountChecks } from "@/lib/verification/runner";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Automated tutor account check. Supabase pg_cron calls ?scope=pending hourly
 * and ?scope=all once a day; Vercel Cron is a daily backstop.
 */
async function handle(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const all = req.nextUrl.searchParams.get("scope") === "all";
  const result = await runAccountChecks({ scope: all ? "all" : "pending", source: all ? "daily" : "pending" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
