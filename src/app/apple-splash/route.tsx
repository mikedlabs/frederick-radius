import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/**
 * iOS launch (splash) image for the installed PWA.
 *
 * iOS only paints an `apple-touch-startup-image` whose media query matches
 * the device exactly, so `layout.tsx` links one per common iPhone, each
 * pointing here with the device's PIXEL dimensions (?w=&h=). Rendering the
 * splash programmatically means we cover several devices without shipping a
 * binary asset per screen; the remaining sizes (iPad, older/newer phones)
 * are a follow-up. Android needs none of this — it composits its own splash
 * from the manifest `background_color` + maskable icon.
 *
 * The art is the app mark — the Ripple (concentric half-arcs rising from a
 * point, brick tile, paper strokes; brand handoff 2026-07-21, mark 4A) — the
 * same icon you tap, centered on the paper-cream ground with the wordmark
 * below, so the launch reads as the light field guide, not a blank flash.
 */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const width = Math.max(1, Math.min(4096, Number(searchParams.get("w")) || 1170));
  const height = Math.max(1, Math.min(4096, Number(searchParams.get("h")) || 2532));

  // Scale the mark to the shorter edge so portrait + landscape both center well.
  const short = Math.min(width, height);
  const tile = Math.round(short * 0.34);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#EBE2CD",
          gap: Math.round(short * 0.06),
        }}
      >
        <div
          style={{
            width: tile,
            height: tile,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#B5462B",
            borderRadius: Math.round(tile * 0.233),
            overflow: "hidden",
          }}
        >
          {/* The Ripple, exact handoff geometry on the 100-grid. */}
          <svg viewBox="0 0 100 100" width={tile} height={tile}>
            <g fill="none" stroke="#F4EEE2" strokeLinecap="round" strokeWidth={4}>
              <path d="M31 78 A 19 19 0 0 1 69 78" strokeOpacity={0.95} />
              <path d="M15 78 A 35 35 0 0 1 85 78" strokeOpacity={0.55} />
              <path d="M-1 78 A 51 51 0 0 1 101 78" strokeOpacity={0.28} />
            </g>
            <circle cx="50" cy="78" r="8" fill="#F4EEE2" />
          </svg>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: Math.round(short * 0.058),
            fontWeight: 600,
            letterSpacing: -1,
            color: "#16140E",
          }}
        >
          Frederick Radius
        </div>
      </div>
    ),
    { width, height },
  );
}
