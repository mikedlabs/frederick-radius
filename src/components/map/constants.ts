/**
 * Map-surface constants and pure helpers. Lifted out of AppMap.tsx so
 * the orchestration file stays focused on state + effects + layout.
 *
 * Everything here is pure: no React, no refs, no module-level side
 * effects beyond `loadCachedOsm` / `saveCachedOsm` which touch
 * sessionStorage on the client only.
 */
import type { Map as MapboxMap } from "mapbox-gl";
import type { OsmPlace } from "@/lib/integrations/overpass";
import type { Amenity } from "@/lib/loaders/amenities";
import type { LngLat } from "@/lib/geo";

export const OSM_CACHE_KEY = "fr:osm-frederick:v1";
export const OSM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Categories we trust OSM for — these tend not to disappear or change.
 * Restaurants, bars, shops are NOT in this set because OSM data for
 * commercial businesses is notoriously stale (places stay tagged years
 * after they close). We only surface those when the user explicitly opts in.
 */
export const OSM_TRUSTED_CATEGORIES = new Set<string>([
  // Public spaces / civic infra
  "park", "trail", "playground",
  "library",
  "public-safety", // fire stations, police
  "government",
  "civic",
  "transit",
  "museum",
  "public-art",
  "parking",
  // Public amenities (don't go stale — trash cans, benches, restrooms don't "close")
  "restroom", "water", "trash", "recycling", "dog-waste",
  "bench", "picnic", "bike-parking", "bike-repair",
  "defibrillator", "shelter", "wifi", "ev-charging",
]);

export const AMENITY_CATEGORIES = new Set<string>([
  "restroom", "water", "trash", "recycling", "dog-waste",
  "bench", "picnic", "bike-parking", "bike-repair",
  "defibrillator", "shelter", "wifi", "ev-charging",
  // A playground is an amenity people look for, not a business — it
  // rides the amenity tray/layer, not the place cluster.
  "playground",
]);

/**
 * Curated amenities.json uses underscored kinds; the map's marker
 * and grouping language is the hyphenated category slug (what
 * bucketOf / the cat- puck images understand). One small bridge so
 * the 442 curated points render with the right icon and land in the
 * right tray group.
 */
export const AMENITY_KIND_TO_CAT: Record<Amenity["kind"], string> = {
  restroom: "restroom",
  ev_charging: "ev-charging",
  wifi: "wifi",
  bike_parking: "bike-parking",
  picnic: "picnic",
  playground: "playground",
  pool: "pool",
  river_gauge: "river-gauge",
  // Field-collected kinds → existing/new marker slugs. trash, recycling,
  // water, bench, dog-waste already have buckets + icons; dog-water and
  // outlet are the two genuinely new marks (see categoryMarkers.ts).
  // "other" falls through bucketOf to the generic pin.
  trash: "trash",
  recycling: "recycling",
  water: "water",
  bench: "bench",
  dog_waste: "dog-waste",
  dog_water: "dog-water",
  outlet: "outlet",
  bike_repair: "bike-repair",
  other: "other",
};

/**
 * Grouped amenity picker — the "what do you need?" tray. One tap reveals
 * exactly one kind of ground-truth amenity instead of a single bundled
 * dump. Combined with zoom-gating (these only render past street zoom),
 * this is how the map shows everything without overwhelming.
 */
export const AMENITY_GROUPS: {
  key: string;
  label: string;
  glyph: string;
  cats: string[];
  /** Registered as a filter ahead of its data — the tray renders it dimmed
   *  and disabled with a "soon" tag instead of an empty toggle that does
   *  nothing when tapped. Drop this once the points are collected. */
  comingSoon?: boolean;
}[] = [
  { key: "restroom", label: "Restrooms", glyph: "\u{1F6BB}", cats: ["restroom"] },
  { key: "water", label: "Water", glyph: "\u{1F4A7}", cats: ["water"] },
  { key: "trash", label: "Trash", glyph: "\u{1F5D1}", cats: ["trash", "recycling"] },
  // Dog stations — bag dispensers (dog-waste) + dog water (dog-water).
  // No longer "coming soon": the /collect field tool populates these.
  { key: "dog", label: "Dog stations", glyph: "\u{1F43E}", cats: ["dog-waste", "dog-water"] },
  { key: "wifi", label: "Wifi", glyph: "\u{1F4F6}", cats: ["wifi"] },
  { key: "ev", label: "EV charging", glyph: "\u{26A1}", cats: ["ev-charging"] },
  // Power outlets — outdoor/public AC outlets people can charge at.
  // Populated by the /collect field tool.
  { key: "outlet", label: "Outlets", glyph: "\u{1F50C}", cats: ["outlet"] },
  { key: "bike", label: "Bike", glyph: "\u{1F6B2}", cats: ["bike-parking", "bike-repair"] },
  { key: "seating", label: "Sit & picnic", glyph: "\u{1FA91}", cats: ["bench", "picnic"] },
  { key: "play", label: "Playgrounds", glyph: "\u{1F6DD}", cats: ["playground"] },
  // River gauges — USGS sites surfaced as a map layer so the
  // "Rivers & creeks" data isn't trapped on /rivers alone. Tap a
  // gauge pin to jump to /rivers for live readings + trend.
  { key: "river_gauge", label: "Gauges", glyph: "\u{1F30A}", cats: ["river-gauge"] },
  { key: "safety", label: "AED & shelter", glyph: "\u{2795}", cats: ["defibrillator", "shelter"] },
  // Catch-all for field-collected points that don't fit a fixed type
  // (the /collect tool's "Other" option, described in the note).
  { key: "other", label: "Other", glyph: "\u{1F4CD}", cats: ["other"] },
  // Crowdsourced community reports (the /report layer): hazards, live
  // conditions, tips, and notes. One toggle for the whole community layer.
  {
    key: "community",
    label: "Community",
    glyph: "\u{26A0}\u{FE0F}",
    cats: ["report-hazard", "report-condition", "report-tip", "report-note"],
  },
];

export const EMPTY_FC = {
  type: "FeatureCollection" as const,
  features: [],
};

// Glyphs for the filter chips, matching the map marker language.
export const CHIP_GLYPH: Record<string, string> = {
  food: "\u{1F37D}", outdoors: "\u{1F333}", arts: "\u{1F3A8}", family: "\u{1F46A}",
  shopping: "\u{1F6CD}", wellness: "\u{1F49A}", civic: "\u{1F3DB}", services: "\u{1F527}",
  lodging: "\u{1F3E8}", transit: "\u{1F68C}", parking: "\u{1F17F}", amenities: "\u{1F6BB}",
  music: "\u{1F3B5}", brewery: "\u{1F37A}",
};

export const RADIUS_M = 1609; // 1 mile — the "Radius" ring

export function circlePolygon(
  center: LngLat,
  meters: number,
  steps = 72,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  const latR = meters / 111320;
  const lngR = meters / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

// Camera easing shared by every programmatic move so zooming feels
// calm and consistent — never the hard jump that read as "erratic".
// easeInOutCubic: slow start, slow stop, no snap.
export const CAM_EASE = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Gentle recenter + zoom. The old code flew straight to z15.5 from
 * wherever you were — a county-wide view punching to street level in
 * one motion is exactly the jolt the owner flagged. This clamps the
 * zoom change to a small step toward a sensible focus level and eases
 * it, so tapping a result or a search hit glides instead of snapping.
 */
export function smoothFocus(
  map: MapboxMap,
  center: [number, number],
  opts?: { minZoom?: number; maxStep?: number },
) {
  const cur = map.getZoom();
  const want = Math.max(cur, opts?.minZoom ?? 14.5);
  const zoom = Math.min(want, cur + (opts?.maxStep ?? 2.2));
  // The CSS reduced-motion gate can't reach Mapbox's JS camera — honor it here
  // so the glide becomes an instant jump for viewers who asked for less motion.
  const reduce = typeof window !== "undefined"
    && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  map.easeTo({ center, zoom, duration: reduce ? 0 : 900, easing: CAM_EASE, essential: true });
}

export function isTrustedOsm(p: OsmPlace): boolean {
  return OSM_TRUSTED_CATEGORIES.has(p.category_slug);
}

export function isAmenity(p: OsmPlace): boolean {
  return AMENITY_CATEGORIES.has(p.category_slug);
}

export function loadCachedOsm(): OsmPlace[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(OSM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: OsmPlace[] };
    if (Date.now() - parsed.at > OSM_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveCachedOsm(data: OsmPlace[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      OSM_CACHE_KEY,
      JSON.stringify({ at: Date.now(), data }),
    );
  } catch {
    // sessionStorage might be full; ignore
  }
}

export const FREDERICK: [number, number] = [-77.4105, 39.4143];

// Camera leash for the county map. Frederick County spans roughly
// lat 39.15–39.72, lng -77.76 to -77.0; this box adds a comfortable
// buffer so the user can pan to (and just past) every edge — including
// a "Near me" recenter from a town near the line — but can't drift off
// into empty Pennsylvania / the Atlantic, which only burns tile
// fetches and loses the place. Format: [[west, south], [east, north]].
//
// County lock (data brief 6.2): the map carries the county identity, so
// panning can never wander out of Frederick County. The brief's nominal
// box is [[-77.68, 39.20], [-77.10, 39.72]], but 11 real county-edge
// pins (Myersville, Burkittsville, Rosemont) sit just west of -77.68, so
// these bounds are derived from the actual pin extent plus a roughly 4
// mile margin: tight enough to lock to the county, wide enough that no
// real place is unreachable. The boundary OUTLINE drawn on the map still
// comes from the county GIS dataset; this is only the pan clamp.
export const FREDERICK_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-77.76, 39.21],
  [-77.09, 39.78],
];

/** Tight county extent used as a camera FIT target. This is deliberately
 * separate from validation bounds and from the looser browse-map pan leash. */
export const FREDERICK_COUNTY_BOUNDS: [[number, number], [number, number]] = [
  [-77.70, 39.20],
  [-77.08, 39.74],
];

/** The browse map needs breathing room around the county. Using the tight
 * county extent as both fit target and maxBounds makes Mapbox zoom back in on
 * mismatched screen shapes, clipping the very county we asked it to show. */
export const FREDERICK_BROWSE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-78.35, 38.75],
  [-76.45, 40.20],
];

/** Narrow-phone minimum for the browse map only. Other embedded maps retain
 * the stronger county-lock minimum below. */
export const FREDERICK_BROWSE_MIN_ZOOM = 6.8;

// Zoom clamp (6.2): embedded maps remain locally framed at minZoom 9. The
// main browse map supplies its own responsive lower minimum.
export const FREDERICK_MIN_ZOOM = 9;
export const FREDERICK_MAX_ZOOM = 19;

/**
 * Is a coordinate inside the county pan bounds? (6.2) Used by the
 * geolocation flow: a user outside the county is recentered on downtown
 * Frederick rather than flown out of the locked area. Pure, so it is
 * unit tested. Reads the same FREDERICK_MAX_BOUNDS the map clamps to, so
 * the check and the leash can never disagree.
 */
export function isInFrederickCounty(lng: number, lat: number): boolean {
  const [[w, s], [e, n]] = FREDERICK_MAX_BOUNDS;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

// Base style chosen so applyFrederickPalette() can do its thing.
// dark-v11 is a simple legacy style with predictable layer naming —
// the System-Black palette in applyFrederickPalette walks every
// layer and rewrites paint, which works cleanly on dark-v11 but is
// largely no-op on Standard (Standard's layer IDs don't match the
// palette's substring rules + Standard's own atmospheric sky fights
// the override). We tried dark-v11 RAW once and it read as generic
// nightlife app — the palette is what turns it into Frederick.
// Pairs with the dark app shell, makes the Monocacy + Carroll Creek
// pop in civic blue, and lets the Catoctin hillshade register.
//
// The custom Frederick Radius Mapbox Studio style (P2-1) replaces
// this when designed; until then light-v11 + applyFrederickPalette
// is the "designed for here" path that costs no dashboard work.
// Switched from dark-v11 (System Black era) to light-v11 in PR 7+:
// the rest of the brand is paper-cream, so the map should be too.
export const STYLE_URL = "mapbox://styles/mapbox/light-v11";

// Baked-style opt-in (MAP_AUDIT.md, Slice 2 owner-alternative). When
// NEXT_PUBLIC_MAP_BAKED_STYLE=1, the map loads a STATIC style JSON
// (src/components/map/frederick-style.json, generated by
// scripts/build-map-style.mjs) that already carries the Frederick palette,
// so the runtime applyFrederickPalette layer-walk — the biggest first-paint
// cost — is skipped entirely. Default OFF: prod stays on the proven runtime
// recolor path until the baked look is verified on a preview (tiles can't be
// pixel-checked from the sandbox). The hillshade relief + county spotlight
// are NOT baked into the JSON, so the baked path still installs those two.
export const MAP_BAKED_STYLE = process.env.NEXT_PUBLIC_MAP_BAKED_STYLE === "1";

// ── Curated-vs-OSM dedupe ───────────────────────────────────────────
// The map renders our curated set AND the live OSM layer; anything in
// both used to show twice. This now defers to the ONE shared rule
// (src/lib/dedupe.ts) — same safelist, same name logic as the loader
// — so an OSM "Baker Park" folds into the curated one while an OSM
// "Carroll Creek Parking Deck" is never wrongly merged into the park.
// ~300 m cells so a ±1 neighborhood always spans the 250 m rule.
export const DUPE_K = 370;

export function dupeCellKey(lat: number, lng: number): string {
  return `${Math.round(lat * DUPE_K)},${Math.round(lng * DUPE_K)}`;
}
