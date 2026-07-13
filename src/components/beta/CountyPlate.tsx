import { MUNICIPALITIES } from "@/data/municipalities";
import RING from "@/data/county-ring.json" with { type: "json" };

/**
 * CountyPlate — a static, engraved range-map of Frederick County for the beta
 * cover, in place of the old scrolling towns marquee (owner call, Jul 2026:
 * show breadth without motion). The real county outline (county-ring.json)
 * projected with a cosine-latitude correction so the shape is geographically
 * true, plus a pin + label for all 13 communities. Frederick, the county
 * seat, gets the vermilion dot; the rest are spruce.
 *
 * Server component on purpose: the SVG is rendered to HTML once, so the
 * 716-point boundary never ships to the client and there are no map tiles,
 * no JS, and no animation. A field-guide plate, not an app map.
 */

const ring = RING as number[][];

// ── Projection (equirectangular with a cosine-lat aspect correction) ────────
const lngs = ring.map((p) => p[0]);
const lats = ring.map((p) => p[1]);
const minLng = Math.min(...lngs);
const maxLng = Math.max(...lngs);
const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const midLat = (minLat + maxLat) / 2;
const K = Math.cos((midLat * Math.PI) / 180); // 1° lng is shorter than 1° lat this far north
const PAD = 44;
const W = 1000;
const EFF_W = (maxLng - minLng) * K;
const H = PAD * 2 + ((maxLat - minLat) / EFF_W) * (W - 2 * PAD);

function proj(lng: number, lat: number): [number, number] {
  const x = PAD + ((lng - minLng) * K) / EFF_W * (W - 2 * PAD);
  const y = PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - 2 * PAD);
  return [x, y];
}

// Outline path — downsample by 2 for a lighter path that keeps the shape.
const OUTLINE =
  "M" +
  ring
    .filter((_, i) => i % 2 === 0)
    .map(([lng, lat]) => {
      const [x, y] = proj(lng, lat);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" L") +
  " Z";

// Two bottom-left neighbours (Rosemont just above Brunswick) sit close enough
// that their outward labels would collide; nudge them apart vertically.
const LABEL_DY: Record<string, number> = { rosemont: -15, brunswick: 17 };
const CX = W / 2;

const PINS = MUNICIPALITIES.map((m) => {
  const [x, y] = proj(m.centroid.lng, m.centroid.lat);
  const seat = m.slug === "frederick";
  const right = x >= CX;
  const gap = seat ? 17 : 13;
  return {
    slug: m.slug,
    name: m.name.replace(/^Downtown\s+/, ""), // "Downtown Frederick" -> "Frederick"
    seat,
    x,
    y,
    labelX: right ? x + gap : x - gap,
    anchor: (right ? "start" : "end") as "start" | "end",
    labelY: y + 4 + (LABEL_DY[m.slug] ?? 0),
  };
});

export default function CountyPlate() {
  return (
    <svg
      role="img"
      aria-label={`Map of Frederick County with all ${MUNICIPALITIES.length} communities`}
      className="mx-auto block h-auto w-full max-w-[36rem]"
      viewBox={`-182 -14 ${W + 364} ${H + 28}`}
      fill="none"
    >
      {/* The county body: a subtle spruce wash inside an engraved ink outline. */}
      <path
        d={OUTLINE}
        fill="color-mix(in srgb, var(--app-brand-2) 7%, transparent)"
        stroke="color-mix(in srgb, var(--app-ink) 42%, transparent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {PINS.map((p) => (
        <g key={p.slug}>
          <circle
            cx={p.x}
            cy={p.y}
            r={p.seat ? 10 : 6.5}
            fill={p.seat ? "var(--app-brand)" : "var(--app-brand-2)"}
            stroke="var(--app-bg)"
            strokeWidth={2.5}
          />
          <text
            x={p.labelX}
            y={p.labelY}
            textAnchor={p.anchor}
            className="font-serif"
            style={{
              fontSize: p.seat ? 34 : 29,
              fontWeight: p.seat ? 600 : 500,
              fill: p.seat ? "var(--app-ink)" : "var(--app-ink-2)",
            }}
          >
            {p.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
