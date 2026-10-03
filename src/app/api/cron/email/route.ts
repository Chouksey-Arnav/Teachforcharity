import { NextResponse, type NextRequest } from "next/server";
import { drainOutbox } from "@/lib/email/worker";
import { cronAuthorized } from "@/lib/cron-auth";
import { sweepConsentFormDeletions } from "@/lib/consent-form/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends queued emails, then deletes consent-form photos the database has let go of.
 * Called by Supabase pg_cron every 2 minutes and by Vercel Cron daily as a backup.
 */
async function handle(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await drainOutbox(8);
  const consentForms = await sweepConsentFormDeletions();
  if (consentForms.error) console.error("[consent-form] deletion sweep failed", consentForms.error);
  return NextResponse.json({ ...result, consentForms });
}

export const GET = handle;
export const POST = handle;
