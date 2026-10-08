/**
 * Geometry for the county overview map (CountyOverviewMap), kept pure so the
 * server can project shapes once and ship small path strings, and so the
 * alignment between the MapLibre basemap and the drawn overlay is testable.
 *
 * One frame drives every layer. The box is a fixed square, the overlay is
 * drawn in a 1000 x 1000 view space, and MapLibre fits the exact same lng/lat
 * bounds with no padding. Because Web Mercator is linear in x and in the
 * Mercator y, a point lands on the same pixel in the canvas, the SVG and the
 * HTML labels.
 */

/**
 * Overlay view space. Square, to match the box's CSS aspect ratio: the county
 * is a little taller than wide, and a square frame leaves the room beside it
 * that the western towns' labels need on a phone.
 */
export const OVERVIEW_VIEW_WIDTH = 1000;
export const OVERVIEW_VIEW_HEIGHT = 1000;
export const OVERVIEW_ASPECT = OVERVIEW_VIEW_WIDTH / OVERVIEW_VIEW_HEIGHT;

/**
 * Height in CSS pixels of the wide overview (the /pulse status map): a full
 * column-width strip that holds the same square frame, centered, at this size.
 * The square keeps every layer on one projection, so the wide box needs no
 * second frame and the MapLibre canvas fits the same bounds it always does.
 * CountyOverviewMap's wide classes use this number literally.
 */
export const OVERVIEW_WIDE_HEIGHT = 220;

/**
 * Frederick County's TIGER outline extent (src/data/county-boundary.json),
 * [west, south, east, north]. Hardcoded so client code never bundles the
 * outline just to know the frame; the spec checks it against the file.
 */
export const COUNTY_EXTENT = [-77.67716, 39.22027, -77.10672, 39.72005] as const;

/** Breathing room above and below the county, as a share of its height. */
const VERTICAL_PAD = 0.04;

const DEG = 180 / Math.PI;

/** Mercator y, in degree-equivalent units so it compares with longitude. */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + lat / (2 * DEG))) * DEG;
}

function latFromMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp(y / DEG)) - Math.PI / 2) * DEG;
}

const FRAME = (() => {
  const [west, south, east, north] = COUNTY_EXTENT;
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  const pad = (top - bottom) * VERTICAL_PAD;
  const y0 = bottom - pad;
  const y1 = top + pad;
  const width = (y1 - y0) * OVERVIEW_ASPECT;
  const centerX = (west + east) / 2;
  return { x0: centerX - width / 2, x1: centerX + width / 2, y0, y1 };
})();

/**
 * The lng/lat bounds MapLibre fits, `[[west, south], [east, north]]`. Its
 * Mercator aspect equals OVERVIEW_ASPECT, so a square box fits it exactly.
 */
export const COUNTY_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
  [FRAME.x0, latFromMercatorY(FRAME.y0)],
  [FRAME.x1, latFromMercatorY(FRAME.y1)],
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A lng/lat point in overlay view units, rounded to a tenth. */
export function projectOverview(lng: number, lat: number): { x: number; y: number } {
  const x = ((lng - FRAME.x0) / (FRAME.x1 - FRAME.x0)) * OVERVIEW_VIEW_WIDTH;
  const y = ((FRAME.y1 - mercatorY(lat)) / (FRAME.y1 - FRAME.y0)) * OVERVIEW_VIEW_HEIGHT;
  return { x: round1(x), y: round1(y) };
}

type Position = readonly number[];
export type OverviewGeometry =
  | { type: "Polygon"; coordinates: readonly (readonly Position[])[] }
  | { type: "MultiPolygon"; coordinates: readonly (readonly (readonly Position[])[])[] };

function ringPath(ring: readonly Position[], minStep: number): string {
  const kept: { x: number; y: number }[] = [];
  for (const position of ring) {
    const [lng, lat] = position;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    // Whole view units: half a pixel at most on the widest overview, and
    // a third fewer characters in the page.
    const projected = projectOverview(lng, lat);
    const point = { x: Math.round(projected.x), y: Math.round(projected.y) };
    const last = kept[kept.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < minStep) continue;
    kept.push(point);
  }
  if (kept.length < 3) return "";
  return `M${kept.map((p) => `${p.x} ${p.y}`).join(" ")}Z`;
}

/**
 * An SVG path for a Polygon or MultiPolygon in overlay view units. Vertices
 * closer than `minStep` view units to the last kept vertex are dropped, which
 * is invisible at overview scale and keeps the page's HTML small. Rings that
 * collapse below three vertices are skipped, so a tiny municipality never
 * renders a stray sliver. Returns "" for anything unusable.
 */
export function overviewPath(geometry: unknown, minStep = 1.5): string {
  const g = geometry as Partial<OverviewGeometry> | null | undefined;
  if (!g || !Array.isArray(g.coordinates)) return "";
  const polygons =
    g.type === "Polygon"
      ? [g.coordinates as readonly (readonly Position[])[]]
      : g.type === "MultiPolygon"
        ? (g.coordinates as readonly (readonly (readonly Position[])[])[])
        : [];
  return polygons
    .flatMap((rings) => (Array.isArray(rings) ? rings : []))
    .map((ring) => (Array.isArray(ring) ? ringPath(ring, minStep) : ""))
    .filter(Boolean)
    .join("");
}

/** The view rectangle as a path, for an even-odd mask around the county. */
export const OVERVIEW_FRAME_PATH = `M0 0H${OVERVIEW_VIEW_WIDTH}V${OVERVIEW_VIEW_HEIGHT}H0Z`;

export type OverviewLabelSide =
  | "right"
  | "left"
  | "above"
  | "below"
  | "above-right"
  | "below-right"
  | "above-left"
  | "below-left";

export type OverviewLabelInput = {
  id: string;
  /** Point in overlay view units. */
  x: number;
  y: number;
  /** Label text, or null for a point drawn without a label. */
  text: string | null;
};

type Rect = { left: number; top: number; right: number; bottom: number };

/**
 * Label pill metrics in CSS pixels. CountyOverviewMap renders the pill with
 * these exact offsets, so a change here must move the classes there too.
 */
export const OVERVIEW_LABEL = {
  /** Average advance of 11px semibold Public Sans, slightly generous. */
  charWidth: 6.3,
  padX: 6,
  height: 20,
  /** Distance from the point to the near edge of a side label. */
  offset: 8,
  /** Distance from the point to the near corner of a diagonal label. */
  diagonal: 6,
  /** Half the hit box kept clear around every other point. */
  pointClearance: 5,
  /** Gap kept between two labels. */
  spacing: 2,
  /** Labels stay this far inside the box. */
  inset: 2,
} as const;

/** Estimated rendered width of a label pill, in CSS pixels. */
export function overviewLabelWidth(text: string): number {
  return Math.ceil(text.length * OVERVIEW_LABEL.charWidth + OVERVIEW_LABEL.padX * 2);
}

function labelRect(px: number, py: number, width: number, side: OverviewLabelSide): Rect {
  const h = OVERVIEW_LABEL.height;
  const o = OVERVIEW_LABEL.offset;
  const d = OVERVIEW_LABEL.diagonal;
  switch (side) {
    case "right":
      return { left: px + o, top: py - h / 2, right: px + o + width, bottom: py + h / 2 };
    case "left":
      return { left: px - o - width, top: py - h / 2, right: px - o, bottom: py + h / 2 };
    case "above":
      return { left: px - width / 2, top: py - o - h, right: px + width / 2, bottom: py - o };
    case "below":
      return { left: px - width / 2, top: py + o, right: px + width / 2, bottom: py + o + h };
    case "above-right":
      return { left: px + d, top: py - d - h, right: px + d + width, bottom: py - d };
    case "below-right":
      return { left: px + d, top: py + d, right: px + d + width, bottom: py + d + h };
    case "above-left":
      return { left: px - d - width, top: py - d - h, right: px - d, bottom: py - d };
    case "below-left":
      return { left: px - d - width, top: py + d, right: px - d, bottom: py + d + h };
  }
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.left < b.right + gap &&
    b.left < a.right + gap &&
    a.top < b.bottom + gap &&
    b.top < a.bottom + gap
  );
}

/** Preference order: beside the point reads best, then above or below. */
const SIDES: readonly OverviewLabelSide[] = [
  "right",
  "left",
  "above",
  "below",
  "above-right",
  "below-right",
  "above-left",
  "below-left",
];

type Candidate = { side: OverviewLabelSide; rect: Rect };

/**
 * Label placement for a box `widthPx` wide (height follows the square frame),
 * the same job MapLibre's variable text anchors do, solved in plain layout so
 * the labels can be links.
 *
 * Every label gets up to eight candidate positions around its point that stay
 * inside the box and cover no other point. Then, repeatedly, the label with
 * the fewest positions still free is placed first (ties go to the earlier,
 * higher-priority input), at the position that takes away the fewest free
 * positions from the labels still waiting. A label left with no free position
 * is dropped (null) rather than stacked on another; its point still draws.
 * Placing the most constrained label first is what lets the crowded towns
 * east of Frederick all keep a name on a phone-width map.
 */
export function layoutOverviewLabels(
  points: readonly OverviewLabelInput[],
  widthPx: number,
): Record<string, OverviewLabelSide | null> {
  const heightPx = widthPx / OVERVIEW_ASPECT;
  const scale = widthPx / OVERVIEW_VIEW_WIDTH;
  const pixel = points.map((p, order) => ({ ...p, order, px: p.x * scale, py: p.y * scale }));
  const c = OVERVIEW_LABEL.pointClearance;
  const pointBoxes = pixel.map((p) => ({
    id: p.id,
    rect: { left: p.px - c, top: p.py - c, right: p.px + c, bottom: p.py + c },
  }));

  const out: Record<string, OverviewLabelSide | null> = {};
  let waiting = pixel.flatMap((p) => {
    out[p.id] = null;
    if (!p.text) return [];
    const width = overviewLabelWidth(p.text);
    const candidates: Candidate[] = SIDES.map((side) => ({
      side,
      rect: labelRect(p.px, p.py, width, side),
    })).filter(
      ({ rect }) =>
        rect.left >= OVERVIEW_LABEL.inset &&
        rect.top >= OVERVIEW_LABEL.inset &&
        rect.right <= widthPx - OVERVIEW_LABEL.inset &&
        rect.bottom <= heightPx - OVERVIEW_LABEL.inset &&
        !pointBoxes.some((box) => box.id !== p.id && overlaps(rect, box.rect, 0)),
    );
    return [{ id: p.id, order: p.order, candidates }];
  });

  while (waiting.length > 0) {
    const stuck = waiting.filter((label) => label.candidates.length === 0);
    waiting = waiting.filter((label) => label.candidates.length > 0);
    if (waiting.length === 0) break;
    if (stuck.length > 0) continue;

    const next = waiting.reduce((best, label) =>
      label.candidates.length < best.candidates.length ||
      (label.candidates.length === best.candidates.length && label.order < best.order)
        ? label
        : best,
    );
    const others = waiting.filter((label) => label !== next);
    const cost = (rect: Rect) =>
      others.reduce(
        (sum, label) =>
          sum +
          label.candidates.filter((other) => overlaps(rect, other.rect, OVERVIEW_LABEL.spacing))
            .length,
        0,
      );
    const chosen = next.candidates.reduce((best, candidate) =>
      cost(candidate.rect) < cost(best.rect) ? candidate : best,
    );

    out[next.id] = chosen.side;
    waiting = others.map((label) => ({
      ...label,
      candidates: label.candidates.filter(
        (other) => !overlaps(chosen.rect, other.rect, OVERVIEW_LABEL.spacing),
      ),
    }));
  }
  return out;
}
