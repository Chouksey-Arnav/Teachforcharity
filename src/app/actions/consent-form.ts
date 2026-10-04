"use server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { cleanJpeg, FormImageError, MAX_FORM_BYTES } from "@/lib/consent-form/jpeg";
import { CONSENT_FORM_BUCKET } from "@/lib/consent-form/storage";
import { toActionError, type ActionState } from "@/lib/errors";
import { kickEmails } from "@/lib/email/kick";

const target = z.union([
  z.object({ studentId: z.string().uuid(), token: z.undefined() }),
  z.object({ studentId: z.undefined(), token: z.string().regex(/^[0-9a-f]{64}$/) }),
]);

/**
 * Stores a photo of the signed consent form for an admin to check.
 *
 * The database decides who may upload (the parent account, or the parent's
 * private link for older student accounts) and for which consent; the server
 * checks the file is a readable JPEG, strips its metadata, and stores it in a
 * private bucket only two-factor admins can read.
 */
export async function uploadConsentForm(formData: FormData): Promise<ActionState> {
  const file = formData.get("file");
  const who = target.safeParse({
    studentId: formData.get("studentId") || undefined,
    token: formData.get("token") || undefined,
  });
  if (!who.success) return { ok: false, error: { message: "This page is out of date. Please reload it." } };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: { message: "Choose a photo of the signed form." } };
  if (file.size > MAX_FORM_BYTES) return { ok: false, error: { message: "That photo is too large (3 MB max)." } };

  const service = createServiceClient();
  if (!service) {
    console.error("[consent-form] SUPABASE_SERVICE_ROLE_KEY is not set; uploads are unavailable.");
    return { ok: false, error: { message: "Uploads aren’t available right now. We’ll call you instead." } };
  }

  // Ask the database first, as the person uploading.
  const supabase = await createClient();
  const res = who.data.token
    ? await supabase.rpc("guardian_consent_form_target", { p_token: who.data.token })
    : await supabase.rpc("consent_form_target", { p_student: who.data.studentId! });
  if (res.error) return { ok: false, error: toActionError(res.error) };
  const { consent_id: consentId, via } = res.data as { consent_id: string; via: string };

  let clean: Uint8Array;
  try {
    clean = cleanJpeg(new Uint8Array(await file.arrayBuffer())).bytes;
  } catch (e) {
    if (e instanceof FormImageError) return { ok: false, error: { message: e.message } };
    throw e;
  }
  const sha256 = createHash("sha256").update(clean).digest("hex");
  const path = `${consentId}/${randomUUID()}.jpg`;

  const up = await service.storage.from(CONSENT_FORM_BUCKET).upload(path, clean, { contentType: "image/jpeg", upsert: false });
  if (up.error) {
    console.error("[consent-form] upload failed", up.error.message);
    return { ok: false, error: { message: "The upload didn’t go through. Please try again." } };
  }
  const rec = await service.rpc("record_consent_form", { p_consent: consentId, p_path: path, p_sha256: sha256, p_via: via });
  if (rec.error) {
    await service.storage.from(CONSENT_FORM_BUCKET).remove([path]);
    return { ok: false, error: toActionError(rec.error) };
  }
  kickEmails();
  revalidatePath("/dashboard", "layout");
  if (who.data.token) revalidatePath(`/guardian/${who.data.token}`);
  return { ok: true, message: "Got it — we’ll check your form, usually within two days, and email you when you’re verified." };
}
