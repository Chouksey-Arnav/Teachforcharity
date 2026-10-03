import "server-only";
import { createServiceClient } from "../supabase/admin";

/** Private bucket for photos of signed consent forms (migration 20261003000100). */
export const CONSENT_FORM_BUCKET = "consent-forms";

/**
 * Deletes stored form photos the database has let go of: retakes, replaced
 * uploads, forms past their retention period, and deleted students' forms.
 * Runs with the email worker. Rows stay queued until the Storage API confirms.
 */
export async function sweepConsentFormDeletions(limit = 100): Promise<{ deleted: number; error?: string }> {
  const service = createServiceClient();
  if (!service) return { deleted: 0, error: "SUPABASE_SERVICE_ROLE_KEY is not set" };
  const { data: paths, error } = await service.rpc("pending_consent_form_deletions", { p_limit: limit });
  if (error) return { deleted: 0, error: error.message };
  if (!paths?.length) return { deleted: 0 };
  const removed = await service.storage.from(CONSENT_FORM_BUCKET).remove(paths);
  if (removed.error) return { deleted: 0, error: removed.error.message };
  const done = await service.rpc("finish_consent_form_deletions", { p_paths: paths });
  if (done.error) return { deleted: 0, error: done.error.message };
  return { deleted: paths.length };
}
