import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cron-auth";
import { emailProvider } from "@/lib/email/provider";

export const dynamic = "force-dynamic";

/**
 * Settings a production deploy needs. Values are never returned, only whether
 * each one is set, and only to a caller holding the cron secret.
 */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "CRON_SECRET",
  "SUPABASE_CRON_SECRET",
] as const;
const OPTIONAL = ["NEXT_PUBLIC_CONTACT_EMAIL", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "NEXT_PUBLIC_BING_SITE_VERIFICATION"] as const;

/**
 * Is the deploy wired up? Anyone gets up/down: the database answers (through
 * the service key, like the email worker), and its schema has the newest
 * migration this code needs, so a deploy that ran ahead of its migration
 * shows up at once, and the email provider has its settings, since sign-up
 * codes, password resets and parent links all fail without it. With the cron
 * secret it also lists which settings are missing.
 */
export async function GET(req: NextRequest) {
  const db = createServiceClient();
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";
  let schema: "current" | "behind" | "unknown" = "unknown";
  if (db) {
    // health_check() arrived with the newest migration: "function not found" means the database answered but is behind.
    const { data, error } = await db.rpc("health_check");
    if (!error) {
      database = "ok";
      schema = (data as { practice?: boolean } | null)?.practice ? "current" : "behind";
    } else if (error.code === "PGRST202") {
      database = "ok";
      schema = "behind";
    } else database = "unreachable";
  }
  const provider = emailProvider();
  const emailMissing = provider.missingConfig();
  const email = emailMissing.length ? "not_configured" : "ok";
  const ok = database === "ok" && schema === "current" && email === "ok";
  const body: Record<string, unknown> = { ok, database, schema, email, time: new Date().toISOString() };
  if (cronAuthorized(req.headers.get("authorization"))) {
    body.missing = [...REQUIRED.filter((k) => !process.env[k]), ...emailMissing];
    body.optionalMissing = OPTIONAL.filter((k) => !process.env[k]);
    body.emailProvider = provider.name;
  }
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
