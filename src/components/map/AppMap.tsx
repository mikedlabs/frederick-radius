"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Map, {
  Popup,
  Marker,
  NavigationControl,
  GeolocateControl,
  Source,
  Layer,
  type MapRef,
  type MapMouseEvent,
} from "react-map-gl/mapbox";
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Search as SearchIcon, Navigation as NavIcon, SlidersHorizontal } from "lucide-react";

import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { useMode } from "@/hooks/useMode";
import { defaultsFor } from "@/lib/mode-defaults";
import { scopeClosures } from "@/lib/mode-scope";
import ModeSwitch from "@/components/mode/ModeSwitch";
import Link from "next/link";
import { CATEGORY_BY_SLUG, TOP_CATEGORIES } from "@/data/categories";
import type { Place } from "@/data/places";
import { MUNICIPALITIES } from "@/data/municipalities";
import type { OsmPlace } from "@/lib/integrations/overpass";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
// TYPE ONLY: importing the loader at runtime drags the ~12MB
// places-enrichment.json into the client bundle (a 13MB chunk) and
// the map never loads. Places arrive already decorated from the
// server page; the client only attaches a viewport distance.
import type { PlaceCardData } from "@/lib/loaders/places";
// TYPE ONLY: the amenities loader only reads the small static
// amenities.json, but to keep this component strictly loader-free
// (the rule that closed the 12MB bundle leak) the points arrive as a
// server prop and only the Amenity type is imported (erased at build).
import type { Amenity } from "@/lib/loaders/amenities";
import { FREDERICK_CENTER, haversineMeters, formatDistance, metersToMinutes, type LngLat } from "@/lib/geo";
// THE one duplicate rule (pure, no data imports — bundle-safe). The
// map's curated-vs-OSM de-dupe now uses the exact same contract as
// the canonical loader, so "the same thing twice" is closed by one
// rule on every surface instead of a weaker map-only heuristic.
import { isSamePlace, type DedupeRecord } from "@/lib/dedupe";
import { isKnownClosed } from "@/lib/integrations/closures";
import { haptic } from "@/lib/haptics";
import { applyFrederickPalette } from "./applyFrederickPalette";
import { installCategoryMarkers, bucketOf, BUCKET_COLOR } from "./categoryMarkers";
import { DEMO_FOOD_TRUCKS, type DemoFoodTruck } from "@/data/food-trucks-demo";
import { DEMO_POINTS_PARTNERS, type DemoPointsPartner } from "@/data/radius-points-demo";
import { RADIUS_COIN } from "@/data/city-data-engine";

// Preview-only map demo layers (Food Trucks / Radius Points / Live
// Transit) render sample data, not real coverage. OFF in production;
// set NEXT_PUBLIC_RADIUS_DEMO_LAYERS=1 to enable locally.
const SHOW_DEMO_LAYERS = process.env.NEXT_PUBLIC_RADIUS_DEMO_LAYERS === "1";

type Props = {
  places: PlaceCardData[];
  osmPlaces?: OsmPlace[];
  height?: string;
  /** Full-bleed layout: drop the rounded border, fill the parent. The
   *  /map route uses this so the map IS the page, not a card on it. */
  fullBleed?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Fires on map idle with curated places currently in the viewport,
   *  nearest-to-center first — powers the synced results list. */
  onPlacesInView?: (slugs: string[]) => void;
  /** Tap a result in the synced list → fly the map there and glow it.
   *  `n` is a nonce so re-tapping the same place re-triggers. */
  focus?: { slug: string; n: number } | null;
  /** Live civic points (traffic incidents, 311 reports) for the overlay. */
  civic?: CivicPin[];
  /** Server-fetched amenity points (Mapillary trash detections) merged
   *  into the amenity layer — the secret token stays server-side. */
  extraAmenities?: OsmPlace[];
  /** Curated civic amenities (restrooms, Wi-Fi, EV, bike parking,
   *  picnic, playgrounds — amenities.json, 442 pts). Server prop so
   *  this stays loader-free; always present, unlike the flaky live
   *  OSM amenity fetch. Folded into the same grouped Amenities tray. */
  amenities?: Amenity[];
  /** Server-fetched line geometry for toggleable overlays (#3). Plain
   *  GeoJSON FeatureCollections; default off, so the base map is
   *  unchanged unless the user opts in. */
  trailLines?: MapLineFC;
  transitLines?: MapLineFC;
};

/** Minimal GeoJSON line FeatureCollection (decoupled from the feeds). */
export type MapLineFC = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: unknown; properties: Record<string, unknown> }>;
};
const EMPTY_LINE_FC: MapLineFC = { type: "FeatureCollection", features: [] };

export type CivicPin = {
  kind: "traffic" | "issue";
  lng: number;
  lat: number;
  label: string;
};

const OSM_CACHE_KEY = "fr:osm-frederick:v1";
const OSM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Categories we trust OSM for — these tend not to disappear or change.
 * Restaurants, bars, shops are NOT in this set because OSM data for
 * commercial businesses is notoriously stale (places stay tagged years
 * after they close). We only surface those when the user explicitly opts in.
 */
const OSM_TRUSTED_CATEGORIES = new Set<string>([
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

const AMENITY_CATEGORIES = new Set<string>([
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
const AMENITY_KIND_TO_CAT: Record<Amenity["kind"], string> = {
  restroom: "restroom",
  ev_charging: "ev-charging",
  wifi: "wifi",
  bike_parking: "bike-parking",
  picnic: "picnic",
  playground: "playground",
};

/**
 * Grouped amenity picker — the "what do you need?" tray. One tap reveals
 * exactly one kind of ground-truth amenity instead of a single bundled
 * dump. Combined with zoom-gating (these only render past street zoom),
 * this is how the map shows everything without overwhelming.
 */
const AMENITY_GROUPS: { key: string; label: string; glyph: string; cats: string[] }[] = [
  { key: "restroom", label: "Restrooms", glyph: "\u{1F6BB}", cats: ["restroom"] },
  { key: "water", label: "Water", glyph: "\u{1F4A7}", cats: ["water"] },
  { key: "trash", label: "Trash", glyph: "\u{1F5D1}", cats: ["trash", "recycling"] },
  { key: "dog", label: "Dog stations", glyph: "\u{1F43E}", cats: ["dog-waste"] },
  { key: "wifi", label: "Wifi", glyph: "\u{1F4F6}", cats: ["wifi"] },
  { key: "ev", label: "EV charging", glyph: "\u{26A1}", cats: ["ev-charging"] },
  { key: "bike", label: "Bike", glyph: "\u{1F6B2}", cats: ["bike-parking", "bike-repair"] },
  { key: "seating", label: "Sit & picnic", glyph: "\u{1FA91}", cats: ["bench", "picnic"] },
  { key: "play", label: "Playgrounds", glyph: "\u{1F6DD}", cats: ["playground"] },
  { key: "safety", label: "AED & shelter", glyph: "\u{2795}", cats: ["defibrillator", "shelter"] },
];

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

// Glyphs for the filter chips, matching the map marker language.
const CHIP_GLYPH: Record<string, string> = {
  food: "\u{1F37D}", outdoors: "\u{1F333}", arts: "\u{1F3A8}", family: "\u{1F46A}",
  shopping: "\u{1F6CD}", wellness: "\u{1F49A}", civic: "\u{1F3DB}", services: "\u{1F527}",
  lodging: "\u{1F3E8}", transit: "\u{1F68C}", parking: "\u{1F17F}", amenities: "\u{1F6BB}",
  music: "\u{1F3B5}", brewery: "\u{1F37A}",
};

const RADIUS_M = 1609; // 1 mile — the "Radius" ring

function circlePolygon(center: LngLat, meters: number, steps = 72): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  const latR = meters / 111320;
  const lngR = meters / (111320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

// Camera easing shared by every programmatic move so zooming feels
// calm and consistent — never the hard jump that read as "erratic".
// easeInOutCubic: slow start, slow stop, no snap.
const CAM_EASE = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Gentle recenter + zoom. The old code flew straight to z15.5 from
 * wherever you were — a county-wide view punching to street level in
 * one motion is exactly the jolt the owner flagged. This clamps the
 * zoom change to a small step toward a sensible focus level and eases
 * it, so tapping a result or a search hit glides instead of snapping.
 */
function smoothFocus(
  map: MapboxMap,
  center: [number, number],
  opts?: { minZoom?: number; maxStep?: number },
) {
  const cur = map.getZoom();
  const want = Math.max(cur, opts?.minZoom ?? 14.5);
  const zoom = Math.min(want, cur + (opts?.maxStep ?? 2.2));
  map.easeTo({ center, zoom, duration: 900, easing: CAM_EASE, essential: true });
}

function isTrustedOsm(p: OsmPlace): boolean {
  return OSM_TRUSTED_CATEGORIES.has(p.category_slug);
}

function isAmenity(p: OsmPlace): boolean {
  return AMENITY_CATEGORIES.has(p.category_slug);
}

function loadCachedOsm(): OsmPlace[] | null {
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

function saveCachedOsm(data: OsmPlace[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(OSM_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // sessionStorage might be full; ignore
  }
}

const FREDERICK: [number, number] = [-77.4105, 39.4143];
// Mapbox Standard: the brightest, most polished style Mapbox ships.
// Includes 3D building extrusions by default, atmospheric sky, day/
// night lighting that follows the user's clock, and proper street
// labels. Switching from dark-v11 → standard is the single biggest
// "the map looks designed" change available; the dark style read as
// generic-nightlife-app and hid the terrain hillshading we'd added.
// The custom Frederick Radius Studio style (P2-1) replaces this when
// ready; until then Standard is a real-feeling map of the county.
const STYLE_URL = "mapbox://styles/mapbox/standard";

// ── Curated-vs-OSM dedupe ───────────────────────────────────────────
// The map renders our curated set AND the live OSM layer; anything in
// both used to show twice. This now defers to the ONE shared rule
// (src/lib/dedupe.ts) — same safelist, same name logic as the loader
// — so an OSM "Baker Park" folds into the curated one while an OSM
// "Carroll Creek Parking Deck" is never wrongly merged into the park.
// ~300 m cells so a ±1 neighborhood always spans the 250 m rule.
const DUPE_K = 370;
function dupeCellKey(lat: number, lng: number): string {
  return `${Math.round(lat * DUPE_K)},${Math.round(lng * DUPE_K)}`;
}

type SelectedOsm = OsmPlace & { _kind: "osm" };
type SelectedPlace = Place & { _kind: "place" };
type Selected = SelectedOsm | SelectedPlace | null;

export default function AppMap({
  places,
  osmPlaces: osmFromProps,
  height = "78vh",
  fullBleed = false,
  initialCenter = FREDERICK,
  initialZoom = 14,
  onPlacesInView,
  focus,
  civic = [],
  extraAmenities = [],
  amenities = [],
  trailLines = EMPTY_LINE_FC,
  transitLines = EMPTY_LINE_FC,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const { openSheet } = usePlaceSheet();
  // Mode-driven layer defaults. The map mounts client-side via
  // dynamic({ ssr:false }), so the initial mode read here is the
  // localStorage-persisted value (not the SSR fallback). When the
  // user flips the toggle later, the effect below resets the four
  // layer toggles to the new mode's defaults — predictable behavior
  // beats preserving the previous session's manual toggles.
  const { mode } = useMode();
  const initialDefaults = useMemo(() => defaultsFor(mode), [mode]);
  const [selected, setSelected] = useState<Selected>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [hover, setHover] = useState<{ lng: number; lat: number; label: string; sub?: string } | null>(null);
  const [activeCats, setActiveCats] = useState<Set<string>>(() => new Set(initialDefaults.categories));
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>(osmFromProps ?? loadCachedOsm() ?? []);
  const [osmLoading, setOsmLoading] = useState(osmPlaces.length === 0);
  // P0-10: a fatal Mapbox failure (missing/invalid token, style auth)
  // must degrade to a stable branded state, never a blank rectangle.
  const [mapError, setMapError] = useState(false);
  // P0-10: a graceful note when the user denies (or we cannot get)
  // geolocation, instead of the "Near me" button silently doing nothing.
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [osmError, setOsmError] = useState<string | null>(null);
  const [showUnverified, setShowUnverified] = useState(false);
  const [amenityGroups, setAmenityGroups] = useState<Set<string>>(() => new Set(initialDefaults.amenityGroups));
  const [amenityOpen, setAmenityOpen] = useState(false);
  // The category rail is heavy; collapsed by default so the in-map
  // deck stays a clean glass bar. "Filters" reveals it as a panel.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [demo, setDemo] = useState<null | "food-truck" | "transit" | "rewards">(null);
  const [truck, setTruck] = useState<DemoFoodTruck | null>(null);
  const [pointsPlace, setPointsPlace] = useState<DemoPointsPartner | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [q, setQ] = useState("");
  const [userLoc, setUserLoc] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [showCivic, setShowCivic] = useState(initialDefaults.civic);
  const [showTrails, setShowTrails] = useState(initialDefaults.lineLayers.includes("trails"));
  const [showTransit, setShowTransit] = useState(initialDefaults.lineLayers.includes("transit"));

  // On mode flip (user tapped the toggle, or geo suggestion landed):
  // reset every layer-toggle to the new mode's defaults. We deliberately
  // do NOT preserve the prior session's manual toggles — the brief calls
  // out predictability over preservation. The first-render guard uses
  // a ref so the initial useState seeding above is not double-applied.
  const isFirstModeSync = useRef(true);
  useEffect(() => {
    if (isFirstModeSync.current) {
      isFirstModeSync.current = false;
      return;
    }
    const d = defaultsFor(mode);
    setActiveCats(new Set(d.categories));
    setAmenityGroups(new Set(d.amenityGroups));
    setShowTrails(d.lineLayers.includes("trails"));
    setShowTransit(d.lineLayers.includes("transit"));
    setShowCivic(d.civic);
  }, [mode]);

  useEffect(() => {
    if (osmFromProps) {
      setOsmPlaces(osmFromProps);
      saveCachedOsm(osmFromProps);
      setOsmLoading(false);
      return;
    }
    if (osmPlaces.length > 0) {
      setOsmLoading(false);
      return;
    }
    let cancelled = false;
    setOsmLoading(true);
    setOsmError(null);
    (async () => {
      try {
        const { fetchOsmFrederick } = await import("@/lib/integrations/overpass");
        const data = await fetchOsmFrederick();
        if (cancelled) return;
        setOsmPlaces(data);
        saveCachedOsm(data);
      } catch (err) {
        if (cancelled) return;
        setOsmError(err instanceof Error ? err.message : "Failed to load OSM data");
      } finally {
        if (!cancelled) setOsmLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [osmFromProps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tap a result in the synced list → fly there, glow it, light haptic.
  useEffect(() => {
    if (!focus) return;
    const p = places.find((x) => x.slug === focus.slug);
    const map = mapRef.current?.getMap();
    if (!p || !map) return;
    setSelectedSlug(p.slug);
    haptic("light");
    // Pan to the result without zooming in — the user already chose
    // their zoom level; we just move the camera to put the pin in
    // view. This is the change that kills "the map keeps jumping
    // around" on mobile.
    map.easeTo({
      center: [p.geom.lng, p.geom.lat],
      duration: 600,
      easing: CAM_EASE,
      essential: true,
    });
  }, [focus, places]);

  // Demo beacons only exist while their demo is on. Closing or switching
  // the demo clears any open card so it never lingers on another layer.
  useEffect(() => {
    if (demo !== "food-truck") setTruck(null);
    if (demo !== "rewards") setPointsPlace(null);
  }, [demo]);

  const filteredPlaces = useMemo(() => {
    const base = places;
    if (activeCats.size === 0) return base;
    return base.filter((p) => {
      const cat = CATEGORY_BY_SLUG[p.category];
      return activeCats.has(p.category) || (cat?.parent && activeCats.has(cat.parent));
    });
  }, [places, activeCats]);

  // Emit the curated places inside the current viewport (nearest-center
  // first) whenever the map settles — drives the synced results list.
  const emitInView = () => {
    if (!onPlacesInView || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const b = map.getBounds();
    if (!b) return;
    const c = map.getCenter();
    const inside = filteredPlaces
      .filter(
        (p) =>
          p.geom.lng >= b.getWest() &&
          p.geom.lng <= b.getEast() &&
          p.geom.lat >= b.getSouth() &&
          p.geom.lat <= b.getNorth()
      )
      .map((p) => ({
        slug: p.slug,
        d: (p.geom.lng - c.lng) ** 2 + (p.geom.lat - c.lat) ** 2,
      }))
      .sort((a, z) => a.d - z.d)
      .slice(0, 60)
      .map((x) => x.slug);
    onPlacesInView(inside);
  };

  // Spatial hash of curated places (as DedupeRecords) for the OSM
  // de-dupe — keyed so a ±1 neighborhood spans the shared rule radius.
  const placeDupeIndex = useMemo(() => {
    // Plain object, not Map — `Map` is the react-map-gl component here.
    const idx: Record<string, DedupeRecord[]> = {};
    for (const p of places) {
      const rec: DedupeRecord = {
        slug: p.slug,
        name: p.name,
        geom: p.geom,
        source: p.source,
        google_place_id: p.google_place_id,
        feature_score: p.feature_score,
      };
      (idx[dupeCellKey(p.geom.lat, p.geom.lng)] ??= []).push(rec);
    }
    return idx;
  }, [places]);

  const osmDupesCurated = useMemo(() => {
    return (p: OsmPlace): boolean => {
      if (!p.name) return false;
      // Same contract as the canonical loader — the safelist inside
      // isSamePlace is what keeps "Carroll Creek Parking Deck" from
      // ever folding into "Carroll Creek Park".
      const osm: DedupeRecord = {
        slug: `osm:${p.osm_id}`,
        name: p.name,
        geom: { lng: p.lng, lat: p.lat },
      };
      const cy = Math.round(p.lat * DUPE_K);
      const cx = Math.round(p.lng * DUPE_K);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = placeDupeIndex[`${cy + dz},${cx + dx}`];
          if (!bucket) continue;
          for (const q of bucket) {
            if (isSamePlace(osm, q)) return true;
          }
        }
      }
      return false;
    };
  }, [placeDupeIndex]);

  const filteredOsmGeoJson = useMemo(() => {
    // Default: only show OSM data we trust (parks/libraries/fire/transit/civic).
    // Commercial businesses (restaurants/shops/bars) only show when user opts in.
    // Amenities (restrooms, water, trash, dog stations) only show when user opts in
    // (these are useful but dense — would clutter the map otherwise).
    // Always filter known-closed places (VOLT, Idiom, etc.) — even from the
    // unverified opt-in view. We never want to show a closed business as open.
    let pool = osmPlaces.filter((p) => !isKnownClosed(p.name));
    pool = showUnverified ? pool : pool.filter(isTrustedOsm);
    // Micro-amenities never ride the clustered business source — they get
    // their own zoom-gated layer so they declutter the wide view.
    pool = pool.filter((p) => !isAmenity(p));
    // Drop OSM pins that duplicate a curated place (same name within
    // ~150 m) — the fix for "still duplicates on the map".
    pool = pool.filter((p) => !osmDupesCurated(p));
    const filtered = activeCats.size === 0
      ? pool
      : pool.filter((p) => {
          const cat = CATEGORY_BY_SLUG[p.category_slug];
          return activeCats.has(p.category_slug) || (cat?.parent && activeCats.has(cat.parent));
        });
    return {
      type: "FeatureCollection" as const,
      features: filtered.map((p) => ({
        type: "Feature" as const,
        properties: {
          osm_id: p.osm_id,
          name: p.name,
          category: p.category_slug,
          osm_tag: p.osm_tag,
          color: CATEGORY_BY_SLUG[p.category_slug]?.color ?? "#7A7975",
          address: p.address ?? "",
          city: p.city ?? "",
          phone: p.phone ?? "",
          website: p.website ?? "",
          opening_hours: p.opening_hours ?? "",
          cuisine: p.cuisine ?? "",
        },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    };
  }, [osmPlaces, activeCats, showUnverified, osmDupesCurated]);

  // Which raw amenity category slugs are active, from the selected groups.
  const activeAmenityCats = useMemo(() => {
    const s = new Set<string>();
    for (const g of AMENITY_GROUPS) {
      if (amenityGroups.has(g.key)) for (const c of g.cats) s.add(c);
    }
    return s;
  }, [amenityGroups]);

  // Amenities live in their own source, rendered only past street zoom
  // (see the amenity-icons layer minzoom). Empty until the user opts in,
  // so the default map is exactly as uncluttered as before.
  const amenityGeoJson = useMemo(() => {
    if (activeAmenityCats.size === 0) return EMPTY_FC;
    // Merge server-fetched Mapillary trash detections in with OSM
    // amenities — same OsmPlace shape, category_slug "trash", so they
    // ride the existing "Trash" toggle with no special-casing.
    const feats = [...osmPlaces, ...extraAmenities]
      .filter(
        (p) =>
          isAmenity(p) &&
          activeAmenityCats.has(p.category_slug) &&
          !isKnownClosed(p.name)
      )
      .map((p) => ({
        type: "Feature" as const,
        properties: {
          osm_id: p.osm_id,
          name: p.name,
          category: p.category_slug,
          osm_tag: p.osm_tag,
          address: p.address ?? "",
          city: p.city ?? "",
          phone: p.phone ?? "",
          website: p.website ?? "",
          opening_hours: p.opening_hours ?? "",
          cuisine: "",
        },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      }));
    // Curated amenities.json — the deterministic, always-present set
    // (the restrooms / Wi-Fi / EV / bike / picnic / playgrounds the
    // owner "added but couldn't see"). Same feature shape, mapped onto
    // the hyphenated category slug so they share the marker language
    // and the same active-group filter as the live OSM amenities.
    const curated = amenities
      .map((a) => ({ a, cat: AMENITY_KIND_TO_CAT[a.kind] }))
      .filter(({ cat }) => activeAmenityCats.has(cat))
      .map(({ a, cat }) => ({
        type: "Feature" as const,
        properties: {
          osm_id: a.id,
          name: a.name,
          category: cat,
          osm_tag: "",
          address: a.detail ?? "",
          city: a.municipality,
          phone: "",
          website: "",
          opening_hours: "",
          cuisine: "",
        },
        geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
      }));
    return { type: "FeatureCollection" as const, features: [...feats, ...curated] };
  }, [osmPlaces, extraAmenities, amenities, activeAmenityCats]);

  /**
   * Curated places as a clustered GeoJSON source.
   * 1,300+ markers rendered individually was the noise — clustering folds
   * them into circles at low zoom and reveals individual pins at high zoom.
   */
  const curatedGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: filteredPlaces.map((p) => ({
      type: "Feature" as const,
      properties: {
        slug: p.slug,
        name: p.name,
        category: p.category,
        color: CATEGORY_BY_SLUG[p.category]?.color ?? "#C4451C",
        bucket: bucketOf(p.category),
        // Draw order within the curated tier: verified places first so
        // the strongest pins win the spot when icons stack.
        pri: p.is_verified ? 0 : 1,
      },
      geometry: { type: "Point" as const, coordinates: [p.geom.lng, p.geom.lat] },
    })),
  }), [filteredPlaces]);

  // The single selected place — drives a soft glow ring under its icon.
  const selectedGeoJson = useMemo(() => {
    const p = selectedSlug ? places.find((x) => x.slug === selectedSlug) : null;
    return {
      type: "FeatureCollection" as const,
      features: p
        ? [{
            type: "Feature" as const,
            properties: { color: CATEGORY_BY_SLUG[p.category]?.color ?? "#C4451C" },
            geometry: { type: "Point" as const, coordinates: [p.geom.lng, p.geom.lat] },
          }]
        : [],
    };
  }, [selectedSlug, places]);

  /**
   * Municipality centroids as label points (no more ugly bbox rectangles).
   * Just a soft label so users can orient. Real polygons would come from
   * the County GIS open data layer when we wire it.
   */
  const muniLabelsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: MUNICIPALITIES.map((m) => ({
      type: "Feature" as const,
      properties: { name: m.name, slug: m.slug },
      geometry: { type: "Point" as const, coordinates: [m.centroid.lng, m.centroid.lat] },
    })),
  }), []);

  // Auto-fit retired. Earlier behavior fitBounds-ed the camera on every
  // category change, which on mobile reads as the map jumping around
  // for no reason the user asked for. The user owns the camera now:
  // pan/zoom only changes via their explicit gesture (or Near me).
  // The filtered set still drives which pins are visible — just not
  // the camera position.

  const onClick = (e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) { setSelectedSlug(null); return; }
    const layer = feature.layer?.id;
    if (!layer) { setSelectedSlug(null); return; }
    const map = mapRef.current?.getMap();

    // Cluster expansion — works for both OSM and curated clusters
    if ((layer === "clusters" || layer === "curated-clusters") && map) {
      setSelectedSlug(null);
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const sourceId = layer === "clusters" ? "osm-businesses" : "curated-places";
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (clusterId !== undefined && source && "getClusterExpansionZoom" in source) {
        (source as unknown as { getClusterExpansionZoom: (id: number, cb: (err: Error | null, zoom: number) => void) => void })
          .getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
            // Glide toward the expansion zoom, but clamped so a tap on a
            // dense downtown cluster steps in calmly instead of snapping
            // the whole county to street level. Very dense clusters take
            // a second tap — that gentle tiering is the intended feel.
            smoothFocus(map, coords, { minZoom: zoom, maxStep: 2.5 });
          });
      }
      return;
    }

    if (layer === "curated-icons") {
      const props = feature.properties as Record<string, string>;
      const place = places.find((p) => p.slug === props.slug);
      setSelectedSlug(props.slug);
      haptic("light");
      // Google-Maps-style: tap a pin → full card slides up from the bottom
      // (photo, rating, hours, directions, save) instead of a cramped popup.
      if (place) openSheet({ ...place, distance_m: haversineMeters(FREDERICK_CENTER, place.geom) });
      return;
    }

    if (layer === "osm-icons" || layer === "amenity-icons") {
      const props = feature.properties as Record<string, string>;
      setSelectedSlug(null);
      haptic("light");
      setSelected({
        _kind: "osm",
        osm_id: props.osm_id,
        name: props.name,
        category_slug: props.category,
        osm_tag: props.osm_tag,
        address: props.address,
        city: props.city,
        phone: props.phone,
        website: props.website,
        opening_hours: props.opening_hours,
        cuisine: props.cuisine,
        lng: (feature.geometry as GeoJSON.Point).coordinates[0] as number,
        lat: (feature.geometry as GeoJSON.Point).coordinates[1] as number,
      });
    }
  };

  // Lightweight hover preview: name (and category) of the pin under the
  // pointer, so the map is scannable without clicking every icon.
  const onHover = (e: MapMouseEvent) => {
    const f = e.features?.[0];
    if (!f || !f.layer?.id) { setHover((h) => (h ? null : h)); return; }
    const props = (f.properties ?? {}) as Record<string, string | number>;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    let next: { lng: number; lat: number; label: string; sub?: string } | null = null;
    if (f.layer.id === "clusters" || f.layer.id === "curated-clusters") {
      next = { lng, lat, label: "A cluster of places", sub: "Zoom in to see them" };
    } else if (f.layer.id === "curated-icons") {
      const p = places.find((x) => x.slug === props.slug);
      if (p) next = { lng, lat, label: p.name, sub: CATEGORY_BY_SLUG[p.category]?.name };
    } else {
      const name = String(props.name ?? "").trim();
      if (name) next = { lng, lat, label: name, sub: CATEGORY_BY_SLUG[String(props.category)]?.name ?? undefined };
    }
    setHover((h) =>
      h && next && h.label === next.label && h.lng === next.lng ? h : next,
    );
  };

  const trustedOsmCount = osmPlaces.filter((p) => isTrustedOsm(p) && !isAmenity(p)).length;
  const unverifiedOsmCount = osmPlaces.filter((p) => !isTrustedOsm(p)).length;
  // OSM amenities are flaky (live Overpass; empty in the sandbox). The
  // curated amenities.json is always present, so the Amenities tray is
  // gated on EITHER source having points — that is the fix for "I
  // don't see the water fountains / things we just added".
  const amenityCount = osmPlaces.filter(isAmenity).length + amenities.length;
  const activeAmenityGroupCount = amenityGroups.size;

  // On-map search — match places already on the map by name/address/city.
  const searchMatches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return places
      .filter((p) =>
        p.name.toLowerCase().includes(term) ||
        (p.address ?? "").toLowerCase().includes(term) ||
        (p.city ?? "").toLowerCase().includes(term)
      )
      .slice(0, 6);
  }, [q, places]);

  const pickSearch = (p: PlaceCardData) => {
    const map = mapRef.current?.getMap();
    setSelectedSlug(p.slug);
    setQ("");
    haptic("light");
    if (map) smoothFocus(map, [p.geom.lng, p.geom.lat], { minZoom: 15 });
    openSheet({ ...p, distance_m: haversineMeters(FREDERICK_CENTER, p.geom) });
  };

  // Near-me radius ring
  const ringGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: userLoc ? [circlePolygon(userLoc, RADIUS_M)] : [],
  }), [userLoc]);
  const dotGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: userLoc
      ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [userLoc.lng, userLoc.lat] } }]
      : [],
  }), [userLoc]);

  // Directions: a direct connector from you to the selected place, with
  // real distance + drive estimate and a one-tap handoff to native maps.
  const selectedPlace = useMemo(
    () => (selectedSlug ? places.find((x) => x.slug === selectedSlug) ?? null : null),
    [selectedSlug, places],
  );
  const routeGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: userLoc && selectedPlace
      ? [{
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [userLoc.lng, userLoc.lat],
              [selectedPlace.geom.lng, selectedPlace.geom.lat],
            ],
          },
        }]
      : [],
  }), [userLoc, selectedPlace]);
  const routeInfo = useMemo(() => {
    if (!userLoc || !selectedPlace) return null;
    const m = haversineMeters(userLoc, selectedPlace.geom);
    return {
      dist: formatDistance(m),
      drive: Math.max(1, Math.round(metersToMinutes("drive", m))),
      href: `https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.geom.lat},${selectedPlace.geom.lng}`,
      name: selectedPlace.name,
    };
  }, [userLoc, selectedPlace]);

  // Mode-aware scoping for civic pins. Visitor mode keeps only
  // major closures (Closed / Detour / Crash / Down …) and hides 311
  // resident-reported issues entirely. Resident mode shows everything
  // ongoing. The scoping is applied even when showCivic is on, so the
  // user's "civic overlay" toggle never lights up visitor-irrelevant
  // 311 dots.
  const scopedCivic = useMemo(() => {
    if (!showCivic) return [] as typeof civic;
    return scopeClosures(civic, defaultsFor(mode).closureScope);
  }, [civic, showCivic, mode]);

  const civicGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: scopedCivic.map((c) => ({
      type: "Feature" as const,
      properties: { kind: c.kind, label: c.label },
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
    })),
  }), [civic, showCivic]);

  const goNearMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setGeoMsg(null);
        const loc = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setUserLoc(loc);
        haptic("light");
        // A deliberate cross-county recenter, so a flight is right here
        // — but eased with the same curve as every other move so it
        // still feels calm, not a snap.
        mapRef.current?.getMap().flyTo({
          center: [loc.lng, loc.lat],
          zoom: 14,
          duration: 1100,
          curve: 1.25,
          easing: CAM_EASE,
          essential: true,
        });
      },
      (err) => {
        setLocating(false);
        setGeoMsg(
          err && err.code === 1
            ? "Location is off — enable it in your browser to use Near me."
            : "Couldn't get your location. Try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div
      className={
        fullBleed
          ? "relative h-full w-full overflow-hidden"
          : "relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      }
      style={fullBleed ? undefined : { borderColor: "var(--app-border)", height }}
    >
      {/* ── Floating in-map control deck (glass). The map renders
          behind; controls overlay it, Apple/Google-Maps style. The
          heavy category rail is tucked into a collapsible panel so the
          default view is a clean, premium map. ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-2.5 pt-2.5 sm:px-3 sm:pt-3">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[680px] flex-col gap-2">
          {/* Mode switch row — always visible per the brief. One tap
              flips Visitor↔Resident and the layer toggles below reset
              to that mode's defaults via the useEffect above. */}
          <div className="flex items-center justify-end">
            <ModeSwitch />
          </div>
          {/* Unified search deck: a single rounded-pill bar with the
              search input filling the row and two icon-only buttons
              tucked into the bar's right side. The previous three
              floating pills (Search · Near me · Layers) read as
              disconnected controls; this one container reads as one
              tool. Locate-me lives at the search bar's right edge so
              users find it where Apple Maps users expect it. Layers
              is a separate small pill so the active-count badge still
              has room to surface. */}
          <div className="flex items-center gap-2">
            <div
              className="relative flex flex-1 items-center overflow-hidden rounded-full border backdrop-blur"
              style={{
                borderColor: "var(--app-border)",
                background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
                boxShadow: "var(--app-shadow-2)",
              }}
            >
              <SearchIcon
                aria-hidden
                className="ml-3.5 h-4 w-4 shrink-0"
                strokeWidth={2.25}
                style={{ color: "var(--app-ink-3)" }}
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the map"
                aria-label="Search the map"
                className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm outline-none"
                style={{ color: "var(--app-ink)" }}
              />
              {/* Locate-me icon button — sits at the search bar's
                  right edge. Brand-tinted when the user has shared
                  their location, neutral otherwise. Tap target keeps
                  the iOS minimum (44pt) via the parent height. */}
              <button
                type="button"
                onClick={goNearMe}
                aria-label="Find places near me"
                aria-busy={locating || undefined}
                title={locating ? "Locating…" : "Find places near me"}
                className="mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-[0.92]"
                style={{
                  color: userLoc ? "var(--app-brand)" : "var(--app-ink-2)",
                  background: userLoc
                    ? "color-mix(in srgb, var(--app-brand) 12%, transparent)"
                    : "transparent",
                }}
              >
                <NavIcon
                  className="h-4 w-4"
                  strokeWidth={userLoc ? 2.5 : 2}
                  fill={userLoc ? "currentColor" : "none"}
                  aria-hidden
                />
              </button>
              {searchMatches.length > 0 && (
                <ul
                  className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[var(--app-radius-md)] border backdrop-blur"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "color-mix(in srgb, var(--app-bg-elevated) 92%, transparent)",
                    boxShadow: "var(--app-shadow-3)",
                  }}
                >
                  {searchMatches.map((p) => {
                    const cat = CATEGORY_BY_SLUG[p.category];
                    return (
                      <li key={p.slug}>
                        <button
                          type="button"
                          onClick={() => pickSearch(p)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-[var(--app-bg-sunken)]"
                        >
                          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat?.color ?? "#C4451C" }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium" style={{ color: "var(--app-ink)" }}>
                              {p.name}
                            </span>
                            <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                              {cat?.name ?? p.category}{p.address ? ` · ${p.address}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-pressed={filtersOpen}
              aria-expanded={filtersOpen}
              aria-label="Layers"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2.5 text-sm font-semibold backdrop-blur transition active:scale-[0.96]"
              style={{
                borderColor: filtersOpen || activeCats.size > 0 || activeAmenityGroupCount > 0 ? "var(--app-brand)" : "var(--app-border)",
                color: filtersOpen || activeCats.size > 0 || activeAmenityGroupCount > 0 ? "var(--app-brand)" : "var(--app-ink-2)",
                background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
                boxShadow: "var(--app-shadow-2)",
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              <span className="hidden sm:inline">Layers</span>
              {activeCats.size + activeAmenityGroupCount > 0 && (
                <span
                  className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--app-brand)] px-1 text-[10px] font-bold tabular-nums text-white"
                >
                  {activeCats.size + activeAmenityGroupCount}
                </span>
              )}
            </button>
          </div>
          {filtersOpen && (
            <div
              className="max-h-[44vh] overflow-y-auto rounded-[var(--app-radius-md)] border p-2.5 backdrop-blur"
              style={{
                borderColor: "var(--app-border)",
                background: "color-mix(in srgb, var(--app-bg-elevated) 90%, transparent)",
                boxShadow: "var(--app-shadow-3)",
              }}
            >
          <ul className="flex flex-wrap items-center gap-2 py-0.5">
            <li>
              <button
                type="button"
                onClick={() => setActiveCats(new Set())}
                aria-pressed={activeCats.size === 0}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: activeCats.size === 0 ? "var(--app-brand)" : "var(--app-bg-elevated)",
                  color: activeCats.size === 0 ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${activeCats.size === 0 ? "var(--app-brand)" : "var(--app-border)"}`,
                  boxShadow: activeCats.size === 0 ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
              >
                All · {(places.length + (showUnverified ? osmPlaces.length : trustedOsmCount)).toLocaleString()}
              </button>
            </li>
            {amenityCount > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setAmenityOpen((v) => !v)}
                  aria-pressed={amenityOpen || activeAmenityGroupCount > 0}
                  aria-expanded={amenityOpen}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: activeAmenityGroupCount > 0 ? "var(--app-cool)" : "var(--app-bg-elevated)",
                    color: activeAmenityGroupCount > 0 ? "white" : "var(--app-ink-2)",
                    border: `1px solid ${activeAmenityGroupCount > 0 || amenityOpen ? "var(--app-cool)" : "var(--app-border)"}`,
                    boxShadow: activeAmenityGroupCount > 0 ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                  }}
                  title="Amenities — restrooms, Wi-Fi, EV charging, bike parking, picnic, playgrounds, water, trash, AED"
                >
                  <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{CHIP_GLYPH.amenities}</span>
                  Amenities
                  {activeAmenityGroupCount > 0 && ` · ${activeAmenityGroupCount}`}
                  <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>{amenityOpen ? "▲" : "▼"}</span>
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() =>
                  setActiveCats((prev) => {
                    const next = new Set(prev);
                    if (next.has("coffee")) next.delete("coffee");
                    else next.add("coffee");
                    return next;
                  })
                }
                aria-pressed={activeCats.has("coffee")}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: activeCats.has("coffee") ? "#8B5A2B" : "var(--app-bg-elevated)",
                  color: activeCats.has("coffee") ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${activeCats.has("coffee") ? "#8B5A2B" : "var(--app-border)"}`,
                  boxShadow: activeCats.has("coffee") ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
                title="Just coffee — cafes, roasters, espresso bars"
              >
                <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{"☕"}</span>
                Coffee
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() =>
                  setActiveCats((prev) => {
                    const next = new Set(prev);
                    if (next.has("worship")) next.delete("worship");
                    else next.add("worship");
                    return next;
                  })
                }
                aria-pressed={activeCats.has("worship")}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: activeCats.has("worship") ? "#5B3A8F" : "var(--app-bg-elevated)",
                  color: activeCats.has("worship") ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${activeCats.has("worship") ? "#5B3A8F" : "var(--app-border)"}`,
                  boxShadow: activeCats.has("worship") ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
                title="Churches, temples, and houses of worship"
              >
                <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{"⛪"}</span>
                Churches
              </button>
            </li>
            {civic.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowCivic((v) => !v)}
                  aria-pressed={showCivic}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: showCivic ? "var(--app-warning)" : "var(--app-bg-elevated)",
                    color: showCivic ? "white" : "var(--app-ink-2)",
                    border: `1px solid ${showCivic ? "var(--app-warning)" : "var(--app-border)"}`,
                    boxShadow: showCivic ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                  }}
                  title="Live traffic incidents and county 311 reports"
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: showCivic ? "white" : "var(--app-warning)" }}
                  />
                  Traffic &amp; 311
                </button>
              </li>
            )}
            {transitLines.features.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowTransit((v) => !v)}
                  aria-pressed={showTransit}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: showTransit ? "var(--app-cool)" : "var(--app-bg-elevated)",
                    color: showTransit ? "white" : "var(--app-ink-2)",
                    border: `1px solid ${showTransit ? "var(--app-cool)" : "var(--app-border)"}`,
                    boxShadow: showTransit ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                  }}
                  title="TransIT bus routes"
                >
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: showTransit ? "white" : "var(--app-cool)" }} />
                  Transit · {transitLines.features.length}
                </button>
              </li>
            )}
            {trailLines.features.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowTrails((v) => !v)}
                  aria-pressed={showTrails}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: showTrails ? "var(--app-positive)" : "var(--app-bg-elevated)",
                    color: showTrails ? "white" : "var(--app-ink-2)",
                    border: `1px solid ${showTrails ? "var(--app-positive)" : "var(--app-border)"}`,
                    boxShadow: showTrails ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                  }}
                  title="County trails"
                >
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: showTrails ? "white" : "var(--app-positive)" }} />
                  Trails · {trailLines.features.length}
                </button>
              </li>
            )}
            {TOP_CATEGORIES.map((c) => {
              const active = activeCats.has(c.slug);
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCats((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.slug)) next.delete(c.slug);
                        else next.add(c.slug);
                        return next;
                      });
                    }}
                    aria-pressed={active}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                    style={{
                      background: active ? c.color : "var(--app-bg-elevated)",
                      color: active ? "white" : "var(--app-ink-2)",
                      border: `1px solid ${active ? c.color : "var(--app-border)"}`,
                      boxShadow: active ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 13, lineHeight: 1, color: active ? "rgba(255,255,255,0.92)" : c.color }}>
                      {CHIP_GLYPH[c.slug] ?? "●"}
                    </span>
                    {c.name}
                  </button>
                </li>
              );
            })}
            {SHOW_DEMO_LAYERS && (<>
            {/* Preview-only demo layers — OFF in production (set NEXT_PUBLIC_RADIUS_DEMO_LAYERS=1 to enable). Sample data, not real coverage. */}
            <li aria-hidden className="mx-1 h-5 w-px shrink-0 self-center" style={{ background: "var(--app-border)" }} />
            {[
              { key: "food-truck" as const, glyph: "\u{1F69A}", label: "Food Trucks" },
              { key: "rewards" as const, glyph: "\u{2B50}", label: "Radius Points" },
              { key: "transit" as const, glyph: "\u{1F68C}", label: "Live Transit" },
            ].map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={() => setDemo(d.key)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-bg-elevated)",
                    color: "var(--app-ink-3)",
                    border: "1px dashed var(--app-border)",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{d.glyph}</span>
                  {d.label}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: "var(--app-accent)", color: "white" }}
                  >
                    Soon
                  </span>
                </button>
              </li>
            ))}
            </>)}
          </ul>
          {/* Amenities sub-tray — toggled by the Amenities chip,
              nested inside the same glass filter panel. */}
          {amenityOpen && (
            <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
            <ul className="flex flex-wrap items-center gap-2 py-0.5">
              {AMENITY_GROUPS.map((g) => {
                const on = amenityGroups.has(g.key);
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() =>
                        setAmenityGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      aria-pressed={on}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.96]"
                      style={{
                        background: on ? "var(--app-cool)" : "var(--app-bg-elevated)",
                        color: on ? "white" : "var(--app-ink-2)",
                        border: `1px solid ${on ? "var(--app-cool)" : "var(--app-border)"}`,
                        boxShadow: on ? "var(--app-shadow-1)" : "none",
                      }}
                    >
                      <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>{g.glyph}</span>
                      {g.label}
                    </button>
                  </li>
                );
              })}
              {activeAmenityGroupCount > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setAmenityGroups(new Set())}
                    className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.96]"
                    style={{ background: "transparent", color: "var(--app-ink-3)", border: "1px solid var(--app-border)" }}
                  >
                    Clear
                  </button>
                </li>
              )}
            </ul>
              <p className="px-1 pt-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                Pick what you need — it appears on the map and folds into your Radius results.
              </p>
            </div>
          )}
            </div>
          )}
        </div>
      </div>

        {mapError && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ background: "var(--app-bg)" }}
            role="alert"
          >
            <p className="font-serif text-base font-semibold" style={{ color: "var(--app-ink)" }}>
              The map is temporarily unavailable
            </p>
            <p className="max-w-xs text-xs leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Every place in the county is still listed below — the map view will return shortly.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              Reload the map
            </button>
          </div>
        )}
        {geoMsg && (
          <div
            className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-white/95 px-3 py-1.5 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            role="status"
          >
            {geoMsg}
            <button type="button" onClick={() => setGeoMsg(null)} aria-label="Dismiss" style={{ color: "var(--app-ink-3)" }}>✕</button>
          </div>
        )}
        {(osmLoading || osmError || osmPlaces.length > 0) && (
          <div
            className="absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur"
            style={{ color: "var(--app-ink-2)" }}
            aria-live="polite"
          >
            {osmLoading ? (
              <>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--app-cool)" }} />
                Loading public places from OpenStreetMap…
              </>
            ) : osmError ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--app-warning)" }} />
                Couldn&apos;t reach OSM; showing curated only
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--app-positive)" }} />
                {showUnverified
                  ? `${osmPlaces.length.toLocaleString()} OSM places (incl. unverified)`
                  : `${trustedOsmCount.toLocaleString()} verified OSM places`}
              </>
            )}
          </div>
        )}
        {/* The "+N unverified" toggle is retired from the deck — it
            exposed data we don't trust and asked the user to opt in
            to weaker quality, which violated the editorial promise.
            showUnverified state stays in component scope (default
            false) so the filtering branch above still compiles. */}

        {/* Directions chip — distance + drive estimate + native handoff */}
        {routeInfo && (
          <div className="absolute inset-x-0 top-3 z-20 flex justify-center px-3">
            <a
              href={routeInfo.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic("light")}
              className="inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold shadow-[var(--app-shadow-2)] backdrop-blur"
              style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.95)", color: "var(--app-ink-2)" }}
            >
              <span aria-hidden style={{ color: "#2A5D8F" }}>→</span>
              <span className="truncate">{routeInfo.name}</span>
              <span style={{ color: "var(--app-ink-3)" }}>
                {routeInfo.dist} · ~{routeInfo.drive} min drive
              </span>
              <span style={{ color: "#2A5D8F" }}>Directions ↗</span>
            </a>
          </div>
        )}

        {/* Legend retired — the floating button competed with the map
            and never carried real signal. The category color band on
            each pin + the in-view drawer's place cards are the legend
            now. (showLegend state kept above to avoid a wider refactor.) */}

        {/* Demo preview for future updates */}
        {demo && (
          <>
          {demo === "food-truck" && (
            <style>{"@keyframes fr-ft-pulse{0%{transform:scale(.55);opacity:.5}70%{opacity:0}100%{transform:scale(2.4);opacity:0}}"}</style>
          )}
          {demo === "rewards" && (
            <style>{"@keyframes fr-rp-pulse{0%{transform:scale(.55);opacity:.5}70%{opacity:0}100%{transform:scale(2.4);opacity:0}}"}</style>
          )}
          <div
            className="absolute inset-x-3 bottom-3 z-20 rounded-[var(--app-radius-md)] border p-3.5 shadow-[var(--app-shadow-3)] backdrop-blur"
            style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.96)" }}
            role="status"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-2xl leading-none">
                {demo === "food-truck" ? "\u{1F69A}" : demo === "rewards" ? "\u{2B50}" : "\u{1F68C}"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--app-ink)" }}>
                  {demo === "food-truck" ? "Food truck map" : demo === "rewards" ? "Radius Points" : "Live transit"}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: "var(--app-accent)", color: "white" }}
                  >
                    Preview
                  </span>
                </p>
                {demo === "rewards" ? (
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                    <p>
                      Radius Points is a preview of a local rewards idea. This preview has no account, no signup, and no payment.
                    </p>
                    <div className="mt-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: "#F2E3C0", color: "#7A5A12" }}
                      >
                        Sample balance 0 points
                      </span>
                    </div>
                    <p className="mt-2 font-semibold" style={{ color: "var(--app-ink)" }}>Earn</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {RADIUS_COIN.earnOpportunities.slice(0, 3).map((o) => (
                        <li key={o.action} className="flex items-center justify-between gap-3">
                          <span>{o.action}</span>
                          <span style={{ color: "#B8860B", fontWeight: 600 }}>+{o.coins}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2">
                      Points redeem at {RADIUS_COIN.redeemPartners} partner businesses across the county. Tap a points pin for a sample partner.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                    {demo === "food-truck"
                      ? "This preview shows sample trucks parked at real Frederick spots. The live version will show every truck's current location and today's menu. Tap a beacon for its menu and the order-ahead preview."
                      : "Coming soon: real-time TransIT bus and MARC train positions, right on the map."}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDemo(null)}
                aria-label="Dismiss preview"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{ color: "var(--app-ink-3)" }}
              >
                ✕
              </button>
            </div>
          </div>
          </>
        )}

        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{
            longitude: initialCenter[0],
            latitude: initialCenter[1],
            zoom: initialZoom,
          }}
          mapStyle={STYLE_URL}
          style={{ width: "100%", height: "100%" }}
          attributionControl={true}
          // Hillshading: Catoctin + South Mountain run the length of
          // Frederick County. With the DEM terrain enabled, the
          // mountains read as terrain instead of being invisible — the
          // single biggest "this map was made for Frederick" signal.
          terrain={{ source: "mapbox-dem", exaggeration: 1.15 }}
          // Atmospheric fog softens the far edges of the county view
          // and gives the map dimensionality at low pitch.
          fog={{
            range: [1, 12],
            color: "rgba(160, 175, 195, 0.5)",
            "horizon-blend": 0.08,
          }}
          interactiveLayerIds={["clusters", "osm-icons", "amenity-icons", "curated-clusters", "curated-icons"]}
          onClick={onClick}
          onLoad={(e) => {
            installCategoryMarkers(e.target);
            // Mapbox Standard is already a designed style — applying
            // our System Black palette over it strips the daylight
            // colors and atmosphere that make Standard read as
            // "designed for here." Skipped on Standard, kept on the
            // legacy v11 styles in case we revert.
            if (!STYLE_URL.includes("standard")) applyFrederickPalette(e.target);
            emitInView();
          }}
          onMoveEnd={emitInView}
          onError={(e) => {
            const msg = String(e?.error?.message ?? "");
            if (/access token|unauthorized|forbidden|\b40[13]\b|failed to (fetch|load)/i.test(msg)) {
              setMapError(true);
            }
          }}
          onMouseMove={onHover}
          onMouseLeave={() => setHover(null)}
        >
          {/* DEM source — required for the terrain prop to resolve. */}
          <Source
            id="mapbox-dem"
            type="raster-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxzoom={14}
          />
          {/* Municipality labels — no fake bbox rectangles, just point labels */}
          <Source id="muni-labels" type="geojson" data={muniLabelsGeoJson}>
            <Layer
              id="muni-label"
              type="symbol"
              minzoom={9}
              maxzoom={13.5}
              layout={{
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-letter-spacing": 0.1,
                "text-transform": "uppercase",
                "text-anchor": "center",
                "text-allow-overlap": false,
              }}
              paint={{
                "text-color": "#7A7975",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.8,
              }}
            />
          </Source>

          {/* #3 toggleable line overlays — rendered BEFORE the point
              layers so pins sit on top. Empty (invisible) unless the
              user opts in; base map unchanged by default. */}
          <Source id="transit-lines" type="geojson" data={(showTransit ? transitLines : EMPTY_LINE_FC) as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="transit-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "var(--app-cool, #2A5D8F)",
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3, 17, 5],
                "line-opacity": 0.75,
              }}
            />
          </Source>
          <Source id="trail-lines" type="geojson" data={(showTrails ? trailLines : EMPTY_LINE_FC) as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="trail-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "var(--app-positive, #1E6B3A)",
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2.5, 17, 4],
                "line-opacity": 0.7,
                "line-dasharray": [2, 1.5],
              }}
            />
          </Source>

          {/* OSM businesses — clustered. Calm tier: a soft cool dot that
              says "more here, zoom in", NOT a loud numbered disk. OSM is
              the secondary layer so it stays quiet and cool-toned. */}
          <Source
            id="osm-businesses"
            type="geojson"
            data={filteredOsmGeoJson}
            cluster
            clusterRadius={64}
            clusterMaxZoom={15}
          >
            {/* Soft halo — gentle depth, barely-there. */}
            <Layer
              id="cluster-glow"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": "#2A5D8F",
                "circle-opacity": 0.14,
                "circle-blur": 1,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 16, 50, 22, 300, 28,
                ],
              }}
            />
            {/* Calm core dot — soft cool tint with a count label on
                top for clusters of 4+. OSM is the secondary tier, so
                its disc stays smaller and quieter than the curated
                one above; the count just tells the user this isn't a
                3-pin pocket but a real density. */}
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": "#2A5D8F",
                "circle-opacity": 0.55,
                "circle-blur": 0.25,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 8, 10, 11, 50, 14, 150, 17, 400, 20,
                ],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1,
                "circle-stroke-opacity": 0.32,
              }}
            />
            <Layer
              id="cluster-counts"
              type="symbol"
              filter={["all", ["has", "point_count"], [">=", ["get", "point_count"], 4]]}
              layout={{
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  4, 9, 50, 11, 200, 12,
                ],
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
              }}
              paint={{
                "text-color": "#FFFFFF",
                "text-halo-color": "rgba(0,0,0,0.3)",
                "text-halo-width": 1.1,
                "text-halo-blur": 0.4,
              }}
            />
            {/* Individual unclustered points — same icon language, smaller
                and a touch softer so curated places stay primary */}
            <Layer
              id="osm-icons"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  12, 0.22,
                  14, 0.3,
                  16, 0.42,
                  18, 0.54,
                ],
                // Collision declutter at every zoom (no step→true): OSM
                // is secondary, so let crowded pins hide and reveal as
                // you zoom — the "dynamic" behavior other maps have.
                "icon-allow-overlap": false,
                "icon-anchor": "center",
              }}
              paint={{ "icon-opacity": 0.8 }}
            />
          </Source>

          {/*
           * Micro-amenities — their own source, NOT clustered, and gated
           * to street zoom (minzoom 14). Off the wide view entirely, so
           * "everything" never means "overwhelming". Opt-in per group.
           */}
          <Source id="amenities" type="geojson" data={amenityGeoJson}>
            <Layer
              id="amenity-icons"
              type="symbol"
              minzoom={12}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  12, 0.26,
                  14, 0.34,
                  16, 0.48,
                  18, 0.62,
                ],
                // Opt-in + minzoom 14 + sparse, but still collision-
                // declutter so a dense block of bins stays readable.
                "icon-allow-overlap": false,
                "icon-anchor": "center",
              }}
              paint={{ "icon-opacity": 0.96 }}
            />
            {/* Labels appear only when you're really close, so a dense
                cluster of stations stays readable. */}
            <Layer
              id="amenity-labels"
              type="symbol"
              minzoom={16.5}
              layout={{
                "text-field": ["get", "name"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 16.5, 9, 18, 12],
                "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
                "text-anchor": "top",
                "text-offset": [0, 1.05],
                "text-optional": true,
                "text-allow-overlap": false,
                "text-max-width": 8,
              }}
              paint={{
                "text-color": "#4A4A48",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.6,
              }}
            />
          </Source>

          {/*
           * Curated places — clustered. With 1,300+ entries, individual markers
           * created visual chaos; clusters keep low-zoom views legible.
           */}
          <Source
            id="curated-places"
            type="geojson"
            data={curatedGeoJson}
            cluster
            clusterRadius={64}
            clusterMaxZoom={15}
            clusterProperties={{
              food: ["+", ["case", ["==", ["get", "bucket"], "food"], 1, 0]],
              outdoors: ["+", ["case", ["==", ["get", "bucket"], "outdoors"], 1, 0]],
              arts: ["+", ["case", ["==", ["get", "bucket"], "arts"], 1, 0]],
              shopping: ["+", ["case", ["==", ["get", "bucket"], "shopping"], 1, 0]],
              civic: ["+", ["case", ["==", ["get", "bucket"], "civic"], 1, 0]],
            }}
          >
            {/* Dominant-category tint, shared by the glow + the disk. */}
            <Layer
              id="curated-cluster-glow"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": [
                  "let",
                  "mx",
                  ["max", ["get", "food"], ["get", "outdoors"], ["get", "arts"], ["get", "shopping"], ["get", "civic"]],
                  [
                    "case",
                    ["==", ["var", "mx"], 0], "#C4451C",
                    ["==", ["get", "food"], ["var", "mx"]], BUCKET_COLOR.food,
                    ["==", ["get", "outdoors"], ["var", "mx"]], BUCKET_COLOR.outdoors,
                    ["==", ["get", "arts"], ["var", "mx"]], BUCKET_COLOR.arts,
                    ["==", ["get", "shopping"], ["var", "mx"]], BUCKET_COLOR.shopping,
                    ["==", ["get", "civic"], ["var", "mx"]], BUCKET_COLOR.civic,
                    "#C4451C",
                  ],
                ],
                "circle-opacity": 0.18,
                "circle-blur": 1,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 18, 50, 26, 300, 34,
                ],
              }}
            />
            <Layer
              id="curated-clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                // Tint by the cluster's dominant category so a glance reads
                // "this dense area is mostly food / arts / civic".
                "circle-color": [
                  "let",
                  "mx",
                  ["max", ["get", "food"], ["get", "outdoors"], ["get", "arts"], ["get", "shopping"], ["get", "civic"]],
                  [
                    "case",
                    ["==", ["var", "mx"], 0], "#C4451C",
                    ["==", ["get", "food"], ["var", "mx"]], BUCKET_COLOR.food,
                    ["==", ["get", "outdoors"], ["var", "mx"]], BUCKET_COLOR.outdoors,
                    ["==", ["get", "arts"], ["var", "mx"]], BUCKET_COLOR.arts,
                    ["==", ["get", "shopping"], ["var", "mx"]], BUCKET_COLOR.shopping,
                    ["==", ["get", "civic"], ["var", "mx"]], BUCKET_COLOR.civic,
                    "#C4451C",
                  ],
                ],
                // Calm category tint. The count label below restores
                // "how many places" without a hard black outline; the
                // disk itself stays soft and the dominant-category color
                // still reads at a glance. Wider radius scale gives
                // dense clusters real visual weight at the county view.
                "circle-opacity": 0.62,
                "circle-blur": 0.25,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 10, 10, 14, 50, 18, 150, 22, 400, 26,
                ],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1,
                "circle-stroke-opacity": 0.4,
              }}
            />
            {/* Count label on top of the cluster disc — small, white,
                no halo'd pill, just numbers. The earlier "no number"
                rule was right that big black count chips were loud;
                but losing the count entirely meant a 12-pin cluster
                read identical to an 80-pin one. A subtle white numeric
                label restores the cardinality signal while keeping
                the calm visual register. Hidden on tiny clusters (3 or
                fewer) since the disc itself already reads as small. */}
            <Layer
              id="curated-cluster-counts"
              type="symbol"
              filter={["all", ["has", "point_count"], [">=", ["get", "point_count"], 4]]}
              layout={{
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  4, 10, 50, 12, 200, 13,
                ],
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
              }}
              paint={{
                "text-color": "#FFFFFF",
                "text-halo-color": "rgba(0,0,0,0.25)",
                "text-halo-width": 1.2,
                "text-halo-blur": 0.5,
              }}
            />
            <Layer
              id="curated-icons"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                // Pin scale by zoom. At the very wide county view
                // (z9–10) the pins should read as small markers
                // (clusters carry the density signal anyway). They grow
                // toward full size as the user zooms into a town. The
                // previous floor at z11=0.5 left county-view pins too
                // big and overlapping; we now start smaller at z9 and
                // ramp up as the user closes in.
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  9, 0.36,
                  11, 0.5,
                  14, 0.72,
                  16, 0.92,
                  18, 1.1,
                ],
                // Decluttering is done by CLUSTERING, not icon collision:
                // with the label-heavy interim base style, collision makes
                // our pins lose to base labels and the map goes empty. So
                // pins always draw (over base labels), and clusterMaxZoom
                // keeps dense areas as count bubbles until you zoom into a
                // small area where only a few pins are unclustered. sort-key
                // still orders gem/verified first.
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-sort-key": ["get", "pri"],
                "icon-anchor": "center",
              }}
            />
            {/* Names reveal as you get closer — fade in past street zoom */}
            <Layer
              id="curated-labels"
              type="symbol"
              minzoom={15}
              filter={["!", ["has", "point_count"]]}
              layout={{
                "text-field": ["get", "name"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 13],
                "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
                "text-anchor": "top",
                "text-offset": [0, 1.15],
                "text-optional": true,
                "text-allow-overlap": false,
                "text-max-width": 9,
                "symbol-sort-key": ["get", "pri"],
              }}
              paint={{
                "text-color": "#1A1A1A",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.7,
                "text-opacity": [
                  "interpolate", ["linear"], ["zoom"],
                  15.5, 0,
                  16.5, 1,
                ],
              }}
            />
          </Source>

          {/* Selected place glow — declared last (no sibling shift) but
              ordered beneath the icons via beforeId. */}
          <Source id="curated-selected" type="geojson" data={selectedGeoJson}>
            <Layer
              id="selected-glow"
              type="circle"
              beforeId="curated-icons"
              paint={{
                "circle-color": ["get", "color"],
                "circle-opacity": 0.16,
                "circle-radius": [
                  "interpolate", ["linear"], ["zoom"],
                  11, 16, 16, 30, 18, 42,
                ],
                "circle-stroke-color": ["get", "color"],
                "circle-stroke-opacity": 0.6,
                "circle-stroke-width": 2,
                "circle-blur": 0.3,
              }}
            />
          </Source>

          {/* Near-me radius ring (under markers) + a "you are here" dot */}
          <Source id="near-ring" type="geojson" data={ringGeoJson}>
            <Layer
              id="ring-fill"
              type="fill"
              beforeId="curated-clusters"
              paint={{ "fill-color": "#C4451C", "fill-opacity": 0.07 }}
            />
            <Layer
              id="ring-line"
              type="line"
              beforeId="curated-clusters"
              paint={{
                "line-color": "#C4451C",
                "line-width": 2,
                "line-opacity": 0.55,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
          <Source id="near-dot" type="geojson" data={dotGeoJson}>
            <Layer
              id="dot-halo"
              type="circle"
              paint={{ "circle-radius": 13, "circle-color": "#2A5D8F", "circle-opacity": 0.22 }}
            />
            <Layer
              id="dot-core"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": "#2A5D8F",
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 2,
              }}
            />
          </Source>
          <Source id="near-route" type="geojson" data={routeGeoJson}>
            <Layer
              id="route-line"
              type="line"
              beforeId="curated-clusters"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#2A5D8F",
                "line-width": 3.5,
                "line-opacity": 0.75,
                "line-dasharray": [0.5, 1.6],
              }}
            />
          </Source>

          {/* Live civic overlay — traffic incidents + 311 reports */}
          <Source id="civic" type="geojson" data={civicGeoJson}>
            <Layer
              id="civic-halo"
              type="circle"
              paint={{
                "circle-radius": 9,
                "circle-color": ["match", ["get", "kind"], "traffic", "#D9A441", "#2A5D8F"],
                "circle-opacity": 0.22,
              }}
            />
            <Layer
              id="civic-core"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": ["match", ["get", "kind"], "traffic", "#D9A441", "#2A5D8F"],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.8,
              }}
            />
          </Source>

          {/* Food-truck beacons — a labeled demo layer, on only while the
              food-truck demo is selected. Each is a pulsing pin; tapping
              one opens a card with the menu and the order-ahead preview. */}
          {demo === "food-truck" &&
            DEMO_FOOD_TRUCKS.map((t) => (
              <Marker key={t.id} longitude={t.lng} latitude={t.lat} anchor="center">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    haptic("light");
                    setTruck(t);
                  }}
                  aria-label={`${t.name}, ${t.cuisine}, preview`}
                  style={{
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    width: 34,
                    height: 34,
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 9999,
                      background: "#C4451C",
                      opacity: 0.5,
                      animation: "fr-ft-pulse 2.2s ease-out infinite",
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: "relative",
                      display: "grid",
                      placeItems: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 9999,
                      background: "#fff",
                      border: "1.5px solid #C4451C",
                      boxShadow: "var(--app-shadow-2)",
                      fontSize: 15,
                      lineHeight: 1,
                    }}
                  >
                    {"\u{1F69A}"}
                  </span>
                </button>
              </Marker>
            ))}

          {truck && (
            <Popup
              longitude={truck.lng}
              latitude={truck.lat}
              anchor="bottom"
              offset={22}
              closeOnClick={false}
              onClose={() => setTruck(null)}
              maxWidth="280px"
            >
              <FoodTruckPopup t={truck} />
            </Popup>
          )}

          {/* Radius Points partner beacons — a labeled rewards-concept
              demo layer, on only while the Radius Points demo is selected.
              Each is a gold star pin; tapping one opens a sample partner
              card with a non-functional join placeholder. No money or
              accounts. */}
          {demo === "rewards" &&
            DEMO_POINTS_PARTNERS.map((p) => (
              <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    haptic("light");
                    setPointsPlace(p);
                  }}
                  aria-label={`${p.name}, Radius Points partner, preview`}
                  style={{
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    width: 34,
                    height: 34,
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 9999,
                      background: "#D9A441",
                      opacity: 0.5,
                      animation: "fr-rp-pulse 2.2s ease-out infinite",
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: "relative",
                      display: "grid",
                      placeItems: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 9999,
                      background: "#fff",
                      border: "1.5px solid #D9A441",
                      boxShadow: "var(--app-shadow-2)",
                      fontSize: 15,
                      lineHeight: 1,
                    }}
                  >
                    {"\u{2B50}"}
                  </span>
                </button>
              </Marker>
            ))}

          {pointsPlace && (
            <Popup
              longitude={pointsPlace.lng}
              latitude={pointsPlace.lat}
              anchor="bottom"
              offset={22}
              closeOnClick={false}
              onClose={() => setPointsPlace(null)}
              maxWidth="280px"
            >
              <PointsPartnerPopup p={pointsPlace} />
            </Popup>
          )}

          {hover && !selected && (
            <Popup
              longitude={hover.lng}
              latitude={hover.lat}
              anchor="bottom"
              offset={16}
              closeButton={false}
              closeOnClick={false}
              className="fr-hover-popup"
            >
              <div style={{ pointerEvents: "none", padding: "2px 2px", maxWidth: 220 }}>
                <strong style={{ display: "block", fontSize: 13, color: "#1A1A1A", lineHeight: 1.25 }}>
                  {hover.label}
                </strong>
                {hover.sub && (
                  <span style={{ fontSize: 11, color: "#7A7975" }}>{hover.sub}</span>
                )}
              </div>
            </Popup>
          )}

          {selected && (
            <Popup
              longitude={selected._kind === "place" ? selected.geom.lng : selected.lng}
              latitude={selected._kind === "place" ? selected.geom.lat : selected.lat}
              anchor="bottom"
              offset={14}
              closeOnClick={false}
              onClose={() => setSelected(null)}
              maxWidth="300px"
            >
              {selected._kind === "place" ? (
                <PlacePopup p={selected} />
              ) : (
                <OsmPopup p={selected} />
              )}
            </Popup>
          )}

          <NavigationControl position="bottom-right" showCompass={false} />
          <GeolocateControl position="bottom-right" trackUserLocation />
        </Map>
      </div>
  );
}

function PointsPartnerPopup({ p }: { p: DemoPointsPartner }) {
  return (
    <div style={{ minWidth: 220, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "#B8860B", marginBottom: 4,
      }}>
        Radius Points · Preview
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {p.name}
      </strong>
      <p style={{ fontSize: 12, margin: "4px 0 8px", color: "#4A4A48" }}>{p.kind}</p>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12,
        color: "#7A5A12", background: "#F7EACB", borderRadius: 8,
        padding: "6px 8px", marginBottom: 10,
      }}>
        <span aria-hidden>{"\u{2B50}"}</span>
        {p.earnLine}
      </div>
      <button
        type="button"
        disabled
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: "1px solid var(--app-border)", background: "var(--app-bg-elevated)",
          color: "var(--app-ink-3)", fontSize: 12, fontWeight: 600, cursor: "not-allowed",
        }}
      >
        Join Radius Points (coming soon)
      </button>
      <p style={{ fontSize: 10, color: "#9A9892", margin: "6px 0 0", lineHeight: 1.4 }}>
        Radius Points is a preview. There is no account, signup, or payment yet. These partners are sample data.
      </p>
    </div>
  );
}

function FoodTruckPopup({ t }: { t: DemoFoodTruck }) {
  return (
    <div style={{ minWidth: 220, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "#C4451C", marginBottom: 4,
      }}>
        Food truck · Preview
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {t.name}
      </strong>
      <p style={{ fontSize: 12, margin: "4px 0 8px", color: "#4A4A48" }}>{t.cuisine}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "#7A7975", marginBottom: 8 }}>
        <span>Parked at {t.spot}</span>
        <span>Here until {t.hereUntil}</span>
      </div>
      <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {t.menu.map((m) => (
          <li key={m} style={{ fontSize: 12, color: "#4A4A48", display: "flex", gap: 6 }}>
            <span aria-hidden style={{ color: "#C4451C" }}>·</span>{m}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: "1px solid var(--app-border)", background: "var(--app-bg-elevated)",
          color: "var(--app-ink-3)", fontSize: 12, fontWeight: 600, cursor: "not-allowed",
        }}
      >
        Order ahead (coming soon)
      </button>
      <p style={{ fontSize: 10, color: "#9A9892", margin: "6px 0 0", lineHeight: 1.4 }}>
        Order ahead is a preview and is not connected yet. These trucks are sample data.
      </p>
    </div>
  );
}

function PlacePopup({ p }: { p: SelectedPlace }) {
  const cat = CATEGORY_BY_SLUG[p.category];
  return (
    <div style={{ minWidth: 200, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: cat?.color ?? "#C4451C", marginBottom: 4,
      }}>
        {cat?.name ?? p.category}
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {p.name}
      </strong>
      <p style={{ fontSize: 12, margin: "6px 0", color: "#4A4A48", lineHeight: 1.45 }}>
        {p.short_blurb}
      </p>
      <Link
        href={`/places/${p.slug}`}
        style={{ fontSize: 12, fontWeight: 600, color: "var(--app-brand)" }}
      >
        Open page →
      </Link>
    </div>
  );
}

function OsmPopup({ p }: { p: SelectedOsm }) {
  const cat = CATEGORY_BY_SLUG[p.category_slug];
  return (
    <div style={{ minWidth: 200, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: cat?.color ?? "#7A7975", marginBottom: 4,
      }}>
        {cat?.name ?? p.category_slug}
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {p.name}
      </strong>
      <p style={{
        marginTop: 4, fontSize: 10, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--app-warning)",
      }}>
        ⚠ Unverified · from OpenStreetMap · may be closed or stale
      </p>
      {p.cuisine && (
        <p style={{ fontSize: 11, marginTop: 4, color: "#7A7975", textTransform: "capitalize" }}>
          {p.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}
        </p>
      )}
      {(p.address || p.city) && (
        <p style={{ fontSize: 12, margin: "6px 0 4px", color: "#4A4A48", lineHeight: 1.4 }}>
          {[p.address, p.city].filter(Boolean).join(", ")}
        </p>
      )}
      {p.opening_hours && (
        <p style={{ fontSize: 11, color: "#7A7975", marginBottom: 4 }}>
          {p.opening_hours}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {p.phone && (
          <a href={`tel:${p.phone}`} style={{ fontSize: 11, color: "var(--app-cool)", fontWeight: 600 }}>
            Call
          </a>
        )}
        {p.website && (
          <a
            href={p.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--app-cool)", fontWeight: 600 }}
          >
            Website ↗
          </a>
        )}
        <a
          href={`https://www.openstreetmap.org/${p.osm_id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: "#7A7975", marginLeft: "auto" }}
        >
          OSM
        </a>
      </div>
    </div>
  );
}
