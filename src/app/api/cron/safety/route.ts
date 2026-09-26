import { NextResponse, type NextRequest } from "next/server";
import { runSafetyScan } from "@/lib/safety/scanner";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Safety scan of all new messages and user-written text. Hourly via Supabase pg_cron, daily via Vercel Cron. */
async function handle(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runSafetyScan("cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
