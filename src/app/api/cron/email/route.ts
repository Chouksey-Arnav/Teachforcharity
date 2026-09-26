import { NextResponse, type NextRequest } from "next/server";
import { drainOutbox } from "@/lib/email/worker";
import { cronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sends queued emails. Called by Supabase pg_cron every 2 minutes and by Vercel Cron daily as a backup. */
async function handle(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await drainOutbox(8);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
