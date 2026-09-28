"use client";
import { useState, useTransition } from "react";
import { Copy, Link2, RefreshCw, Unlink } from "lucide-react";
import { setHoursLink } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";

/** Create, copy, replace or turn off the public hours-verification link. */
export function HoursLinkControls({ url }: { url: string | null }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (action: "create" | "new" | "off") =>
    start(async () => {
      if (action !== "create" && !window.confirm(action === "new" ? "Make a new link? The old link and any printed QR code will stop working." : "Turn off the link? Anyone who has it will see “not found.”")) return;
      const r = await setHoursLink(action);
      if (!r) return;
      if (r.ok) setMsg(r.message ? { ok: true, text: r.message } : null);
      else setMsg({ ok: false, text: r.error.message });
    });
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMsg({ ok: true, text: "Link copied." });
    } catch {
      setMsg({ ok: false, text: "Couldn’t copy — select the link and copy it instead." });
    }
  };

  return (
    <div className="no-print mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {url ? (
          <>
            <Button size="sm" variant="secondary" onClick={copy}>
              <Copy className="size-4" /> Copy link
            </Button>
            <Button size="sm" variant="ghost" pending={pending} onClick={() => run("new")}>
              <RefreshCw className="size-4" /> Make a new link
            </Button>
            <Button size="sm" variant="ghost" pending={pending} onClick={() => run("off")}>
              <Unlink className="size-4" /> Turn off
            </Button>
          </>
        ) : (
          <Button size="sm" pending={pending} onClick={() => run("create")}>
            <Link2 className="size-4" /> Create a verification link
          </Button>
        )}
      </div>
      {msg && (
        <p role="status" className={msg.ok ? "text-sm text-pine-800" : "text-sm text-clay-700"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
