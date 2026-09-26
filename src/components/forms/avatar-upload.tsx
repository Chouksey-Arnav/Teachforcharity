"use client";
import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setAvatar } from "@/app/actions/profile";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/button";

/**
 * Crops to a square and re-encodes to a 512px JPEG in the browser before
 * uploading — this also strips EXIF data such as GPS location.
 */
async function toSquareJpeg(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.86),
  );
}

export function AvatarUpload({ userId, name, path }: { userId: string; name: string; path: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return setError("Please choose a JPG, PNG, or WebP photo.");
    if (file.size > 15 * 1024 * 1024) return setError("That photo is too large (15 MB max).");
    setBusy(true);
    try {
      const blob = await toSquareJpeg(file);
      const supabase = createClient();
      const key = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(key, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error("Upload failed. Please try again.");
      const res = await setAvatar(key);
      if (!res?.ok) throw new Error(res && !res.ok ? res.error.message : "Couldn't save your photo.");
      setCurrent(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const res = await setAvatar(null);
    if (res?.ok) setCurrent(null);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name || "?"} path={current} size={72} />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
            <Spinner />
          </span>
        )}
      </div>
      <div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-line-2 bg-card px-4 text-sm font-medium hover:border-ink/30"
          >
            <Camera className="size-4" /> {current ? "Change photo" : "Add a photo"}
          </button>
          {current && (
            <button type="button" onClick={remove} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-clay-700 hover:bg-clay-50">
              <Trash2 className="size-4" /> Remove
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">A friendly, school-appropriate photo of your face. Optional.</p>
        {error && <p className="mt-1 text-xs text-clay-700">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}
