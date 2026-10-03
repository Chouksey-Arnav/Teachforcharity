"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileCheck2, PhoneCall, Printer } from "lucide-react";
import { uploadConsentForm } from "@/app/actions/consent-form";
import { Button, LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatRelative } from "@/lib/time";

/** Long side of the re-drawn photo: enough to read handwriting, small enough to upload on a phone. */
const MAX_SIDE = 2200;

/**
 * Re-draws the photo onto a canvas and saves it as a JPEG. This drops all
 * metadata (including the GPS location phones add) before anything leaves the
 * device; the server strips it again regardless.
 */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("We couldn’t open that photo. Try a JPG or PNG, or take a screenshot of it.");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can’t process photos. Please wait for our call instead.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= 2.8 * 1024 * 1024) return blob;
  }
  throw new Error("That photo is too large. Try taking it again a little further away.");
}

export interface ConsentUploadProps {
  /** Parent account: their student's id. Parent link: the link's token. */
  studentId?: string;
  token?: string;
  studentName: string;
  guardianName: string;
  relationship: string;
  phone: string;
  code: string;
  printHref: string;
  formSubmittedAt: string | null;
  returnedReason: string | null;
}

/** While consent waits for a check: the phone call, or a photo of the signed form. */
export function ConsentVerification(p: ConsentUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function onFile(file: File) {
    setRes(null);
    if (!file.type.startsWith("image/")) return setRes({ ok: false, text: "Please choose a photo (JPG, PNG or WebP). Scanned a PDF? Take a screenshot of it." });
    if (file.size > 25 * 1024 * 1024) return setRes({ ok: false, text: "That photo is too large (25 MB max)." });
    setBusy(true);
    try {
      const jpeg = await toJpeg(file);
      const fd = new FormData();
      fd.set("file", new File([jpeg], "consent-form.jpg", { type: "image/jpeg" }));
      if (p.studentId) fd.set("studentId", p.studentId);
      if (p.token) fd.set("token", p.token);
      start(async () => {
        const r = await uploadConsentForm(fd);
        setRes(r?.ok ? { ok: true, text: r.message ?? "Uploaded." } : { ok: false, text: r?.error.message ?? "Upload failed. Please try again." });
        if (r?.ok) router.refresh();
      });
    } catch (e) {
      setRes({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const working = busy || pending;

  return (
    <section id="verify" className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold">Confirm you’re {p.studentName}’s parent or guardian</h2>
        <p className="mt-1 text-sm text-muted">
          You signed online. Before lessons and messaging unlock, someone from the program confirms it was you. Pick whichever is easier.
        </p>
      </div>

      {p.formSubmittedAt ? (
        <div className="px-5 py-4">
          <Notice tone="success" title="We have your signed form">
            Uploaded {formatRelative(p.formSubmittedAt)}. A program administrator will check it, usually within two days, and email you when{" "}
            {p.studentName} is all set. You don’t need to wait for a call.
          </Notice>
          <button type="button" className="mt-3 text-[13px] font-medium text-pine-700 hover:underline" onClick={() => input.current?.click()} disabled={working}>
            Upload a clearer photo instead
          </button>
        </div>
      ) : (
        <div className="grid gap-px bg-line sm:grid-cols-2">
          <div className="bg-card px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <PhoneCall className="size-4 text-pine-700" /> Option 1: take a two-minute call
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              We’ll call <strong>{p.phone}</strong>, usually within two days. Nothing to do now.
            </p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileCheck2 className="size-4 text-pine-700" /> Option 2: upload a signed form
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-relaxed text-ink-2">
              <li>
                Print your form, or write the short statement below on any paper.
              </li>
              <li>Sign it by hand, in ink, and date it.</li>
              <li>Take a photo of the whole page and upload it.</li>
            </ol>
          </div>
        </div>
      )}

      {p.returnedReason && !p.formSubmittedAt && (
        <div className="border-t border-line px-5 py-4">
          <Notice tone="warning" title="We couldn’t use your last photo">
            {p.returnedReason}
          </Notice>
        </div>
      )}

      <div className="space-y-4 border-t border-line bg-paper/50 px-5 py-4">
        {!p.formSubmittedAt && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href={p.printHref} target="_blank" size="sm" variant="secondary">
                <Printer className="size-4" /> Print your form
              </LinkButton>
              <Button size="sm" onClick={() => input.current?.click()} pending={working}>
                <Camera className="size-4" /> Upload a photo of it
              </Button>
            </div>
            <details className="rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-ink-2">
              <summary className="cursor-pointer font-medium text-ink">No printer? Hand-write this instead</summary>
              <p className="mt-2">On a blank sheet of paper, write out:</p>
              <blockquote className="mt-2 rounded-lg bg-paper-2/60 px-3 py-2 font-serif text-[14px] leading-relaxed text-ink">
                I, {p.guardianName}, am {p.studentName}’s {p.relationship.toLowerCase() || "parent or guardian"}, and I am 18 or older. I signed the{" "}
                parent/guardian consent for {p.studentName} online and I agree to it. Verification code: <strong>{p.code}</strong>
              </blockquote>
              <p className="mt-2">Then sign your name by hand and write today’s date underneath.</p>
            </details>
          </>
        )}
        <p className="text-xs text-muted">
          Your code is <strong className="font-mono tracking-wider text-ink">{p.code}</strong>. It must be on the paper, so an old or someone
          else’s form can’t be used. Don’t include anything else in the photo, like an ID. Only program administrators can see it, and it’s
          deleted a year after your consent ends. Signing for someone you aren’t the parent or guardian of breaks our Terms.
        </p>
        {res && <Notice tone={res.ok ? "success" : "danger"}>{res.text}</Notice>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        aria-label="Photo of the signed consent form"
      />
    </section>
  );
}
