import { NextResponse, type NextRequest } from "next/server";
import { drainOutbox } from "@/lib/email/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Sends queued emails. Called by Vercel Cron (daily backup) and by Supabase pg_cron (every few minutes). */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await drainOutbox(8);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
