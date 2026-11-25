import TRANSIT from "@/data/transit.json";
import type { LineFC } from "@/lib/integrations/transitFrederick";

const COLORS = new Map(TRANSIT.routes.map((route) => [route.id, route.color]));
const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 18;

type PreviewLine = { routeId: string; color: string; path: string };

/** A bounded north-up diagram of the same committed lines passed to the map.
 * No streets, live markers, inferred stop locations, network or device access. */
export function buildTransitNetworkPreview(shapes: LineFC, width = WIDTH): PreviewLine[] {
  if (shapes.source !== "official-gtfs" || shapes.features.length > 128) return [];
  const lines: Array<{ routeId: string; color: string; points: number[][] }> = [];
  let pointCount = 0;
  for (const feature of shapes.features) {
    const routeId = feature.properties.routeId;
    const color = typeof routeId === "string" ? COLORS.get(routeId) : undefined;
    if (typeof routeId !== "string" || !color || !/^#[0-9a-f]{6}$/i.test(color)) continue;
    const geometry = feature.geometry as { type?: unknown; coordinates?: unknown } | null;
    if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) continue;
    const coordinates: unknown[] = geometry.coordinates;
    pointCount += coordinates.length;
    if (pointCount > 32_768) return [];
    // Reject the complete broken line rather than joining across a missing fix.
    if (coordinates.length < 2 || coordinates.some((point) => !Array.isArray(point)
      || point.length < 2 || typeof point[0] !== "number" || !Number.isFinite(point[0]) || Math.abs(point[0]) > 180
      || typeof point[1] !== "number" || !Number.isFinite(point[1]) || Math.abs(point[1]) > 90)) continue;
    lines.push({ routeId, color, points: coordinates as number[][] });
  }
  if (lines.length === 0) return [];
  let west = Infinity; let east = -Infinity; let south = Infinity; let north = -Infinity;
  for (const line of lines) for (const [lng, lat] of line.points) {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  const longitudeScale = Math.cos(((south + north) / 2) * Math.PI / 180);
  const spanX = (east - west) * longitudeScale;
  const spanY = north - south;
  if (Math.max(spanX, spanY) <= 0) return [];
  const scale = Math.min((width - PADDING * 2) / (spanX || Number.MIN_VALUE), (HEIGHT - PADDING * 2) / (spanY || Number.MIN_VALUE));
  const centerX = (west + east) / 2;
  const centerY = (south + north) / 2;
  return lines.map(({ routeId, color, points }) => ({
    routeId, color,
    path: points.map(([lng, lat], index) => `${index === 0 ? "M" : "L"}${((lng - centerX) * longitudeScale * scale + width / 2).toFixed(2)},${((centerY - lat) * scale + HEIGHT / 2).toFixed(2)}`).join(" "),
  }));
}

export default function TransitNetworkPreview({ shapes, compact = false }: { shapes: LineFC; compact?: boolean }) {
  const width = compact ? HEIGHT : WIDTH;
  const lines = buildTransitNetworkPreview(shapes, width);
  if (lines.length === 0) return null;
  return <div className="w-full">
    <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${width} ${HEIGHT}`} className={compact ? "block h-full w-full" : "mx-auto block h-44 w-full max-w-xl"} data-transit-static-network={compact ? undefined : true}>
      {lines.map((line, index) => <g key={`${line.routeId}:${index}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={line.path} stroke="var(--app-ink)" strokeOpacity=".12" strokeWidth={compact ? 2.5 : 5} vectorEffect={compact ? "non-scaling-stroke" : undefined} />
        <path d={line.path} stroke={line.color} strokeWidth={compact ? 1.4 : 3} vectorEffect={compact ? "non-scaling-stroke" : undefined} />
      </g>)}
    </svg>
    {!compact && <p className="text-[11px] font-medium" style={{ color: "var(--app-ink-2)" }}>Official route diagram · not live</p>}
  </div>;
}
