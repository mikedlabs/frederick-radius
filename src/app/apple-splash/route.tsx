import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND, RIPPLE_GEOMETRY } from "@/lib/brand";

export const dynamic = "force-static";

const SPLASH_FONT = readFile(
  join(process.cwd(), "src/app/api/og/fonts/libre-caslon-display-400.woff"),
);

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
export async function GET(request: Request) {
  const displayFont = await SPLASH_FONT;
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
          background: BRAND.colors.cream,
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
            background: BRAND.colors.brick,
            borderRadius: Math.round(tile * 0.233),
            overflow: "hidden",
          }}
        >
          {/* Match the Apple launcher tile: 72% art with the same optical correction. */}
          <svg viewBox="0 0 100 100" width={tile} height={tile}>
            <g transform={`translate(14 14) scale(.72) translate(0 ${RIPPLE_GEOMETRY.full.opticalOffsetY})`}>
              <g fill="none" stroke={BRAND.colors.cream} strokeLinecap="round" strokeWidth={RIPPLE_GEOMETRY.full.strokeWidth}>
                {RIPPLE_GEOMETRY.full.paths.map((path, index) => (
                  <path key={path} d={path} strokeOpacity={RIPPLE_GEOMETRY.full.opacities[index]} />
                ))}
              </g>
              <circle cx="50" cy={RIPPLE_GEOMETRY.full.baseline} r={RIPPLE_GEOMETRY.full.dotRadius} fill={BRAND.colors.cream} />
            </g>
          </svg>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: Math.round(short * 0.058),
            fontFamily: BRAND.type.display,
            fontWeight: 400,
            letterSpacing: -0.5,
            color: BRAND.colors.ink,
          }}
        >
          Frederick Radius
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: [
        {
          name: BRAND.type.display,
          data: displayFont,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
