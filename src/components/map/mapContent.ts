import type { ExpressionSpecification } from "mapbox-gl";
import type { MapDiscoveryEvidence } from "./mapDiscoveries";
import type { EventPin, MapLineFC, MapPinPlace } from "./types";
import { bucketOf, isDestinationBucket } from "./categoryMarkers";
import {
  MAPBOX_LABEL_FONT_BOLD,
  MAPBOX_LABEL_FONT_MEDIUM,
} from "./mapboxFieldGuideStyle";
import { pointInReachPolygon } from "@/components/radius/reach";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { formatEventTime } from "@/lib/format/eventTime";
import { openNowCountLabel } from "@/lib/hours-availability";
import type { LngLat } from "@/lib/geo";

const EASTERN = "America/New_York";

/**
 * A compact, honest source timestamp for map cards. Absolute time is used
 * instead of a render-time "N minutes ago" claim so server snapshots stay
 * truthful after hydration and shared screenshots still make sense.
 */
export function formatMapTimestamp(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * The trust line shown on a selected map finding. Sources are deduplicated and
 * capped so the proof is visible without turning the mobile peek into a wall
 * of provenance. A date appears only when evidence carries a real observation
 * timestamp; undated records are never made to look freshly checked.
 */
export function discoveryTrustLine(evidence: MapDiscoveryEvidence[]): string {
  const sources = [...new Set(evidence.map((item) => item.source.trim()).filter(Boolean))];
  const shown = sources.slice(0, 2);
  const sourceText = shown.length === 0
    ? "Source details available"
    : shown.join(" + ") + (sources.length > shown.length ? ` +${sources.length - shown.length}` : "");

  const dated = evidence
    .map((item) => item.observedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time)[0];
  const observed = dated ? formatMapTimestamp(dated.value) : null;

  return observed
    ? `Sources: ${sourceText} · dated ${observed}`
    : `Sources: ${sourceText}`;
}

/** The two facts that earn space in Radius mode's always-visible mobile peek. */
export function radiusResultLine(
  places: number,
  openNow: number,
  openOnly = false,
  mayReportNoneOpen = false,
): string {
  if (places === 0) return "No places within reach";
  if (openOnly) {
    if (openNow > 0) {
      return `${openNow.toLocaleString("en-US")} confirmed open within reach`;
    }
    return mayReportNoneOpen
      ? "None open within reach"
      : "Open hours unconfirmed within reach";
  }
  return `${places.toLocaleString("en-US")} ${places === 1 ? "place" : "places"} · ${openNowCountLabel(openNow, mayReportNoneOpen)}`;
}

/**
 * The cold Contents button should say what the map is currently doing, not
 * display a mystery count. Keep the readout to two short facts so it survives
 * a narrow phone: the chosen area and the strongest active task.
 */
export function mapContentsSummary({
  area,
  amenity,
  intent,
  time,
  layer,
}: {
  area: string;
  amenity?: string;
  intent?: string;
  time?: string;
  layer?: string;
}): string {
  const task = amenity ?? intent ?? time ?? layer;
  return task ? `${area} · ${task}` : "Contents";
}

export type MapEventGroup = {
  id: string;
  lng: number;
  lat: number;
  /** The place the events share, or the first event's title when no row
   * names a venue. Never a placeholder such as "Events here". */
  venueLabel: string;
  /** True when venueLabel is a venue name rather than an event title. */
  venueKnown: boolean;
  events: EventPin[];
};

/**
 * Events often share an exact venue coordinate. Drawing one 44px marker per
 * occurrence makes a flower of overlapping buttons that is hard to tap and
 * can extend far from the actual venue. Group points within roughly one
 * downtown block, retain every event in chronological order, and let the map
 * render one honest count marker that opens the list.
 */
export function groupMapEvents(
  events: readonly EventPin[],
  coordinatePrecision = 4,
): MapEventGroup[] {
  const grouped = new Map<string, EventPin[]>();
  for (const event of events) {
    const key = `${event.lng.toFixed(coordinatePrecision)}:${event.lat.toFixed(coordinatePrecision)}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }

  return [...grouped.entries()]
    .map(([id, bucket]) => {
      const ordered = [...bucket].sort(
        (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
      );
      // Two spellings of one building can share a cell. Name the group by the
      // place of its first event that names one, and only fall back to that
      // event's own title when no row carries a venue at all.
      const venue = ordered
        .map((event) => (event.venue_name ?? "").trim())
        .find(Boolean);
      return {
        id,
        lng: ordered[0].lng,
        lat: ordered[0].lat,
        venueLabel: venue ?? ordered[0].title.trim(),
        venueKnown: Boolean(venue),
        events: ordered,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(a.events[0].starts_at) - Date.parse(b.events[0].starts_at) ||
        a.id.localeCompare(b.id),
    );
}

/** "Trivia Night at The Den", or only "Trivia Night" when the feed sent no
 * venue. Never a dangling "Trivia Night at ". */
export function eventMarkerAriaLabel(
  event: Pick<EventPin, "title" | "venue_name">,
): string {
  const title = event.title.trim();
  const venue = (event.venue_name ?? "").trim();
  return venue ? `${title} at ${venue}` : title;
}

/** The accessible name of an event marker, single or grouped. */
export function eventGroupAriaLabel(
  group: Pick<MapEventGroup, "events" | "venueLabel" | "venueKnown">,
): string {
  if (group.events.length === 1) return eventMarkerAriaLabel(group.events[0]);
  return group.venueKnown
    ? `${group.events.length} events at ${group.venueLabel}`
    : `${group.events.length} events, starting with ${group.venueLabel}`;
}

// ── Place names on the map ───────────────────────────────────────────────
//
// The map used to print no place name at any zoom: the only label layer
// started at z15.8 and lost collision to the category pucks drawn beside it.
// The name now rides inside the place symbol itself (text-optional), so
// collision drops the label and never the place, and a short list of places
// worth naming is named first.

/** Who earns a name first. Lower ranks are placed first and shown earlier. */
export const PLACE_LABEL_RANK = {
  fieldNotes: 0,
  reviewedBlurb: 1,
  localFavorite: 2,
  other: 3,
} as const;

/** Ranks at or under this one are named from z14; the rest from z15.5. */
export const PLACE_LABEL_EARLY_RANK = PLACE_LABEL_RANK.localFavorite;
export const PLACE_LABEL_EARLY_ZOOM = 14;
export const PLACE_LABEL_ALL_ZOOM = 15.5;
/** Ink at 11.5 px in the 600-weight stack; the selected place at 13/700. */
export const PLACE_LABEL_SIZE = 11.5;
export const SELECTED_PLACE_LABEL_SIZE = 13;
export const PLACE_LABEL_HALO_WIDTH = 1.2;

/**
 * Field notes come first, then a description Radius wrote or reviewed (a
 * pin's short_blurb survives the loader's editorial trust boundary only in
 * that case), then a local favorite. A favorite counts only for places people
 * go to, so a favorite print shop or salon is not named ahead of the block.
 */
export function placeLabelRank(
  place: Pick<
    MapPinPlace,
    "category" | "field_notes" | "short_blurb" | "local_favorite"
  >,
): number {
  if (place.field_notes) return PLACE_LABEL_RANK.fieldNotes;
  if (place.short_blurb?.trim()) return PLACE_LABEL_RANK.reviewedBlurb;
  if (place.local_favorite && isDestinationBucket(bucketOf(place.category))) {
    return PLACE_LABEL_RANK.localFavorite;
  }
  return PLACE_LABEL_RANK.other;
}

type PlaceLabelOptions = {
  selectedSlug: string | null;
  /** Small single-subject maps name every place as soon as it is drawn. */
  compact: boolean;
  /** The emphasis layer for a search or category match. */
  matchLayer?: boolean;
};

function isSelectedPlace(selectedSlug: string | null): ExpressionSpecification {
  return ["==", ["get", "slug"], selectedSlug ?? ""];
}

const NAME: ExpressionSpecification = ["get", "name"];

/** A rank the early tier reaches; a feature without one counts as "other". */
const NAMED_EARLY: ExpressionSpecification = [
  "<=",
  ["coalesce", ["get", "labelRank"], PLACE_LABEL_RANK.other],
  PLACE_LABEL_EARLY_RANK,
];

/**
 * The text each place symbol carries. Layout is evaluated per whole tile
 * zoom, so the early tier is named from z14 and every place from z15; the
 * paint ramp in curatedPlaceLabelOpacity reveals the rest at z15.5.
 * Matches keep the z13 start the old label layer gave them.
 */
export function curatedPlaceLabelField({
  selectedSlug,
  compact,
  matchLayer = false,
}: PlaceLabelOptions): ExpressionSpecification {
  if (compact) return NAME;
  const selected = isSelectedPlace(selectedSlug);
  if (matchLayer) {
    return ["step", ["zoom"], ["case", selected, NAME, ""], 13, NAME];
  }
  return [
    "step",
    ["zoom"],
    [
      "case",
      ["any", selected, NAMED_EARLY],
      NAME,
      "",
    ],
    15,
    NAME,
  ];
}

export function curatedPlaceLabelFont(
  selectedSlug: string | null,
): ExpressionSpecification {
  return [
    "case",
    isSelectedPlace(selectedSlug),
    ["literal", [...MAPBOX_LABEL_FONT_BOLD]],
    ["literal", [...MAPBOX_LABEL_FONT_MEDIUM]],
  ];
}

export function curatedPlaceLabelSize(
  selectedSlug: string | null,
): ExpressionSpecification {
  return [
    "case",
    isSelectedPlace(selectedSlug),
    SELECTED_PLACE_LABEL_SIZE,
    PLACE_LABEL_SIZE,
  ];
}

/** Selected first, then label rank, then verified before unverified. */
export function curatedPlaceSortKey(
  selectedSlug: string | null,
): ExpressionSpecification {
  return [
    "case",
    isSelectedPlace(selectedSlug),
    -1,
    [
      "+",
      ["*", ["coalesce", ["get", "labelRank"], PLACE_LABEL_RANK.other], 2],
      ["coalesce", ["get", "pri"], 1],
    ],
  ];
}

/**
 * Label visibility. `hidden` is a live-conditions task that owns the canvas;
 * `receded` is a selection or foreground reference, where every other name
 * steps back and the selected place stays readable.
 */
export function curatedPlaceLabelOpacity({
  selectedSlug,
  compact,
  matchLayer = false,
  hidden,
  receded,
}: PlaceLabelOptions & {
  hidden: boolean;
  receded: boolean;
}): ExpressionSpecification | number {
  if (hidden) return 0;
  const selected = isSelectedPlace(selectedSlug);
  if (receded) return ["case", selected, 1, 0.14];
  const dimmed: ExpressionSpecification = ["==", ["get", "dimmed"], true];
  if (compact || matchLayer) return ["case", selected, 1, dimmed, 0.12, 1];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    PLACE_LABEL_ALL_ZOOM - 0.3,
    [
      "case",
      selected,
      1,
      dimmed,
      0,
      NAMED_EARLY,
      1,
      0,
    ],
    PLACE_LABEL_ALL_ZOOM,
    ["case", selected, 1, dimmed, 0.12, 1],
  ];
}

// ── Event times on the untouched overview ────────────────────────────────

export const OVERVIEW_EVENT_LIMIT = 6;
export const OVERVIEW_EVENT_LEAD_MS = 2 * 60 * 60_000;

/** Geometry shared with the .fr-overview-event CSS, in CSS pixels. */
const OVERVIEW_DOT_HALF = 7; // 10 px dot plus its 2 px Cream ring
const OVERVIEW_PILL_OFFSET = 11; // dot radius plus a 6 px gap
const OVERVIEW_PILL_HALF_HEIGHT = 12;
const OVERVIEW_PILL_PADDING = 16;
const OVERVIEW_PILL_GAP = 6;
const OVERVIEW_CHAR_WIDTH = 6.6;
const OVERVIEW_TITLE_MAX = 140;
const OVERVIEW_PILL_MAX = 200;

export type OverviewEventMarker = {
  event: EventPin;
  live: boolean;
  /** "Now" for an event underway, otherwise its Eastern start ("7 PM"). */
  timeLabel: string;
  /** Spoken name: "Bluegrass Jam, starts at 7 PM, Steinhardt Brewing". */
  ariaLabel: string;
  /** False when the pill would cover another marker or an earlier pill. The
   * dot always stays, so a crowded block never loses an event. */
  showPill: boolean;
};

function clockLabel(startsAt: string): string {
  return formatEventTime(startsAt).replace(":00 ", " ");
}

/** Web Mercator world pixels at a zoom, on Mapbox's 512 px tile grid. Only
 * differences matter, so no viewport offset is needed. */
function worldPixel(lng: number, lat: number, zoom: number) {
  const scale = 512 * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

type Box = { left: number; top: number; right: number; bottom: number };

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * At most six events for the untouched county overview: each underway now
 * (a trustworthy published window, the same test as "Live now") or starting
 * within two hours, one per venue, soonest first. All-day rows have no time
 * to show and are left to the Events tab. Pills are laid out greedily at the
 * camera's zoom so two downtown events never print over each other.
 */
export function overviewEventMarkers(
  events: readonly EventPin[],
  {
    now,
    zoom,
    limit = OVERVIEW_EVENT_LIMIT,
  }: { now: Date; zoom: number; limit?: number },
): OverviewEventMarker[] {
  const nowMs = now.getTime();
  const candidates = events
    .filter((event) => !event.is_all_day && event.title.trim())
    .filter((event) => Number.isFinite(event.lng) && Number.isFinite(event.lat))
    .map((event) => ({
      event,
      start: Date.parse(event.starts_at),
      live: isEventLiveNow(event, now),
    }))
    .filter(
      ({ start, live }) =>
        Number.isFinite(start) &&
        (live || (start >= nowMs && start <= nowMs + OVERVIEW_EVENT_LEAD_MS)),
    )
    .sort((a, b) => a.start - b.start || a.event.slug.localeCompare(b.event.slug));

  const cells = new Set<string>();
  const picked: typeof candidates = [];
  for (const candidate of candidates) {
    const cell = `${candidate.event.lng.toFixed(4)}:${candidate.event.lat.toFixed(4)}`;
    if (cells.has(cell)) continue;
    cells.add(cell);
    picked.push(candidate);
    if (picked.length >= limit) break;
  }

  const points = picked.map(({ event }) => worldPixel(event.lng, event.lat, zoom));
  const dots: Box[] = points.map(({ x, y }) => ({
    left: x - OVERVIEW_DOT_HALF,
    right: x + OVERVIEW_DOT_HALF,
    top: y - OVERVIEW_DOT_HALF,
    bottom: y + OVERVIEW_DOT_HALF,
  }));
  const pills: Box[] = [];

  return picked.map(({ event, live }, index) => {
    const title = event.title.trim();
    const timeLabel = live ? "Now" : clockLabel(event.starts_at);
    const width = Math.min(
      OVERVIEW_PILL_MAX,
      OVERVIEW_PILL_PADDING +
        Math.min(OVERVIEW_TITLE_MAX, title.length * OVERVIEW_CHAR_WIDTH) +
        OVERVIEW_PILL_GAP +
        timeLabel.length * OVERVIEW_CHAR_WIDTH,
    );
    const { x, y } = points[index];
    const pill: Box = {
      left: x + OVERVIEW_PILL_OFFSET,
      right: x + OVERVIEW_PILL_OFFSET + width,
      top: y - OVERVIEW_PILL_HALF_HEIGHT,
      bottom: y + OVERVIEW_PILL_HALF_HEIGHT,
    };
    const showPill =
      !dots.some((dot, other) => other !== index && overlaps(pill, dot)) &&
      !pills.some((placed) => overlaps(pill, placed));
    if (showPill) pills.push(pill);
    const venue = (event.venue_name ?? "").trim();
    return {
      event,
      live,
      timeLabel,
      ariaLabel: `${title}, ${live ? "happening now" : `starts at ${timeLabel}`}${venue ? `, ${venue}` : ""}`,
      showPill,
    };
  });
}

// ── The town peek ────────────────────────────────────────────────────────

function pointInBoundaryGeometry(point: [number, number], geometry: unknown): boolean {
  const shape = geometry as { type?: string; coordinates?: unknown } | null;
  const polygons: unknown[] =
    shape?.type === "Polygon"
      ? [shape.coordinates]
      : shape?.type === "MultiPolygon" && Array.isArray(shape.coordinates)
        ? shape.coordinates
        : [];
  return polygons.some((rings) => {
    if (!Array.isArray(rings) || rings.length === 0) return false;
    const [outer, ...holes] = rings as number[][][];
    return (
      pointInReachPolygon(point, outer) &&
      !holes.some((hole) => pointInReachPolygon(point, hole))
    );
  });
}

/**
 * The town peek's kicker. "You are in" is a claim about the device, so it is
 * made only when a real location fix sits inside that town's County GIS
 * boundary. Without the boundary or the fix, the peek says "Town".
 */
export function townPeekKicker({
  slug,
  userLoc,
  boundaries,
}: {
  slug: string;
  userLoc: LngLat | null;
  boundaries: MapLineFC;
}): "You are in" | "Town" {
  if (!userLoc) return "Town";
  const point: [number, number] = [userLoc.lng, userLoc.lat];
  const inside = boundaries.features.some(
    (feature) =>
      feature.properties?.slug === slug &&
      pointInBoundaryGeometry(point, feature.geometry),
  );
  return inside ? "You are in" : "Town";
}
