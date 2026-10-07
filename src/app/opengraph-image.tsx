import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: free music lessons from high school musicians for North Carolina middle schoolers`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card shown by search, social and chat link previews. Colours are the theme tokens from globals.css
// (paper, ink, pine-700, glow); the image renderer can't read CSS variables.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: "#f8f6ee", color: "#16201c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, letterSpacing: 4, textTransform: "uppercase", color: "#1f5446" }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: "#f4d36f" }} />
          {SITE.name} · {SITE.region}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, lineHeight: 1.05, fontFamily: "serif", letterSpacing: -2 }}>Free music lessons from someone who was just in your seat.</div>
          <div style={{ fontSize: 34, color: "#2b3531" }}>Band &amp; orchestra · one-on-one on Google Meet · parent-approved</div>
        </div>
      </div>
    ),
    size,
  );
}
