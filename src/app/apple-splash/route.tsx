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
 * The art is the app mark (spruce tile, cream ring, vermilion dot — the same
 * icon you tap) centered on the paper-cream ground, with the wordmark below,
 * so the launch reads as the light field guide, not a blank flash.
 */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const width = Math.max(1, Math.min(4096, Number(searchParams.get("w")) || 1170));
  const height = Math.max(1, Math.min(4096, Number(searchParams.get("h")) || 2532));

  // Scale the mark to the shorter edge so portrait + landscape both center well.
  const short = Math.min(width, height);
  const tile = Math.round(short * 0.34);
  const ring = Math.round(tile * 0.42);
  const ringStroke = Math.round(tile * 0.1);
  const dot = Math.round(tile * 0.16);

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
            background: "#16352B",
            borderRadius: Math.round(tile * 0.22),
          }}
        >
          <div
            style={{
              width: ring,
              height: ring,
              borderRadius: 9999,
              border: `${ringStroke}px solid #EEE6D4`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: dot, height: dot, borderRadius: 9999, background: "#E14328" }} />
          </div>
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
