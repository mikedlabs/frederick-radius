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
import type { GeoJSONSource, StyleSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { useMode } from "@/hooks/useMode";
import { defaultsFor } from "@/lib/mode-defaults";
import { scopeClosures } from "@/lib/mode-scope";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import Link from "next/link";
import { municipalCivicFor, civicContacts } from "@/lib/loaders/municipalCivic";
import type { OsmPlace } from "@/lib/integrations/overpass";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/lib/search/index";
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
import { haversineMeters, formatDistance, metersToMinutes, type LngLat } from "@/lib/geo";
import { readCachedPosition } from "@/hooks/useGeolocation";
import { sizedImage } from "@/lib/format/img";
// THE one duplicate rule (pure, no data imports — bundle-safe). The
// map's curated-vs-OSM de-dupe now uses the exact same contract as
// the canonical loader, so "the same thing twice" is closed by one
// rule on every surface instead of a weaker map-only heuristic.
import { isSamePlace, type DedupeRecord } from "@/lib/dedupe";
import { isKnownClosed } from "@/lib/integrations/closures";
import { track } from "@/lib/track";
import { haptic } from "@/lib/haptics";
import { applyFrederickPalette, installRelief } from "./applyFrederickPalette";
import { installCountySpotlight } from "./countySpotlight";
// Baked style JSON — the palette pre-applied at build time. Only used when
// MAP_BAKED_STYLE is on; the import is a small (~36KB) static JSON so it's
// cheap to include even when the flag is off (tree-shakers keep it out of the
// runtime path since mapStyle only references it behind the flag).
import BAKED_STYLE from "./frederick-style.json";
import { markMapOnLoad, markMapIdleOnce } from "./mapPerf";
import { readMapLayerPrefs, writeMapLayerPrefs } from "./mapLayerPrefs";
import { installCategoryMarkers, bucketOf, BUCKET_COLOR } from "./categoryMarkers";
// Aerial photo manifest — extracted from EXIF GPS by
// scripts/build-aerial-manifest.mjs. 104 georeferenced drone shots
// across the seasons folders. Powers the "Aerial photos" overlay,
// which is unique to Frederick Radius — no other map shows where
// each photo was taken in the county.
import AERIAL_MANIFEST from "@/../public/images/seasons/aerial-manifest.json";

type AerialPhoto = {
  src: string;
  lat: number;
  lng: number;
  altM: number | null;
  bearing: number | null;
  takenAt: string | null;
  season: "spring" | "summer" | "fall" | "winter";
};
const AERIAL_PHOTOS = AERIAL_MANIFEST as AerialPhoto[];

// The aerial "time machine": scrub the drone archive by season. Colors
// mirror the season tint on the pins (the decorative season palette) so a
// chip reads as the same season as the dots it controls. DOM chips, so
// var() is fine for the neutral "All".
type AerialSeason = "all" | "spring" | "summer" | "fall" | "winter";
const AERIAL_SEASONS: { key: AerialSeason; label: string; color: string }[] = [
  { key: "all", label: "All", color: "var(--app-ink-2)" },
  { key: "spring", label: "Spring", color: "#859076" },
  { key: "summer", label: "Summer", color: "#C99632" },
  { key: "fall", label: "Fall", color: "#A03A22" },
  { key: "winter", label: "Winter", color: "#2F5470" },
];
const AERIAL_SEASON_COUNTS: Record<string, number> = AERIAL_PHOTOS.reduce(
  (acc, p) => ((acc[p.season] = (acc[p.season] ?? 0) + 1), acc),
  {} as Record<string, number>,
);

// ── Tap-a-town: which municipality is under a tapped point ──────────
// Ray-cast point-in-polygon. Even-odd across all rings handles holes
// (a point in a hole counts as outside), and MultiPolygon tries each
// piece. Used to resolve the municipal boundary the user tapped inside.
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygonGeom(lng: number, lat: number, geom: GeoJSON.Geometry): boolean {
  if (geom.type === "Polygon") {
    let c = false;
    for (const ring of geom.coordinates) if (pointInRing(lng, lat, ring as number[][])) c = !c;
    return c;
  }
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      let c = false;
      for (const ring of poly) if (pointInRing(lng, lat, ring as number[][])) c = !c;
      if (c) return true;
    }
    return false;
  }
  return false;
}
/** Boundary "MUNIC" name -> municipality slug (slugified; matches our slugs). */
function townSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Types, constants, and popup components were carved off into siblings
// to keep this file focused on state + effects + layout. No behavior
// change in this PR; later refactors can lift the bottom-deck JSX and
// the pin/cluster layers out the same way.
import {
  EMPTY_LINE_FC,
  type CivicPin,
  type EventPin,
  type MapLineFC,
  type Selected,
} from "./types";
import {
  AMENITY_GROUPS,
  AMENITY_KIND_TO_CAT,
  CAM_EASE,
  DUPE_K,
  EMPTY_FC,
  FREDERICK,
  FREDERICK_MAX_BOUNDS,
  FREDERICK_MIN_ZOOM,
  FREDERICK_MAX_ZOOM,
  isInFrederickCounty,
  MAP_BAKED_STYLE,
  RADIUS_M,
  STYLE_URL,
  circlePolygon,
  dupeCellKey,
  isAmenity,
  isTrustedOsm,
  loadCachedOsm,
  saveCachedOsm,
  smoothFocus,
} from "./constants";
import MapOverlays from "./MapOverlays";
import LiveBuses from "./LiveBuses";
import {
  parseLayersParam,
  serializeLayers,
  type OverlayKey,
} from "@/lib/overlays";
import {
  EventPopup,
  OsmPopup,
  PlacePopup,
} from "./popups";
import AppMapDeck from "./AppMapDeck";

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
  /** County GIS municipal boundary polygons, rendered as a quiet
   *  always-on outline. Server-fetched (fcGis.getMunicipalBoundaries),
   *  empty FC when the county server is unreachable. */
  municipalBoundaries?: MapLineFC;
  /** County boundary polygon — the quiet always-on county edge (6.1),
   *  drawn under the place pins. Empty FC when unavailable. */
  countyBoundary?: MapLineFC;
  /** Upcoming events as map pins — phase 1 differentiator vs Google /
   *  Apple Maps (they don't have local event ↔ venue joins). Already
   *  geo-deduped and scoped to "happening soon" server-side. */
  events?: EventPin[];
  /** Open centered on the user's last-known location when a fresh
   *  cached fix exists (no prompt) — set when arriving via a category
   *  so the map and its list read "from where you're standing." Falls
   *  back to `initialCenter` when there's no cached fix. */
  recenterToKnownLocation?: boolean;
  /** Pinpoint-first: when true (browse mode with no server-side intent
   *  filter) the map opens CLEAN — no curated pins until the user adds a
   *  category — instead of dumping all ~1,700. The control surface lets
   *  them compose what they want to see. */
  pinpointDefault?: boolean;
  /** Amenity-tray group keys to pre-activate (e.g. a /map?amenity=restroom
   *  deep-link from /amenities or /today). Opens the tray showing that layer
   *  on first paint instead of a clean map. */
  initialAmenityGroups?: string[];
};

export default function AppMap({
  places,
  osmPlaces: osmFromProps,
  height = "78vh",
  fullBleed = false,
  initialCenter = FREDERICK,
  initialZoom = 14,
  recenterToKnownLocation = false,
  pinpointDefault = false,
  onPlacesInView,
  focus,
  civic = [],
  extraAmenities = [],
  amenities = [],
  trailLines = EMPTY_LINE_FC,
  transitLines = EMPTY_LINE_FC,
  municipalBoundaries = EMPTY_LINE_FC,
  countyBoundary = EMPTY_LINE_FC,
  events = [],
  initialAmenityGroups,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  // Effective camera home: when we arrived via a category and already
  // hold the user's cached fix, open on them so the map (and its
  // closest-first list) reads "from where you're standing." Read once
  // at mount — never prompts; falls back to the city center. We seed
  // initialViewState directly rather than flyTo so there's no jarring
  // glide from Downtown to the user on load.
  const effectiveCenter = useMemo<[number, number]>(() => {
    if (recenterToKnownLocation) {
      const cached = readCachedPosition();
      if (cached) return [cached.lng, cached.lat];
    }
    return initialCenter;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot read of the cached fix at mount
  }, []);
  // Shareable / reload-safe camera: a `?c=lng,lat,zoom` param (written on
  // moveend below) reopens the map exactly where it was left. Read once at
  // mount; malformed values fall through to the mode/cached default. Mapbox
  // clamps any out-of-region value to maxBounds, so a crafted URL is harmless.
  const urlCamera = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("c");
    if (!raw) return null;
    const [lng, lat, z] = raw.split(",").map(Number);
    if (![lng, lat, z].every((n) => Number.isFinite(n))) return null;
    return { longitude: lng, latitude: lat, zoom: z };
  }, []);
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
  // The hover preview is for a real hovering pointer (a mouse) only. On touch
  // there is no hover: a pan drag fires synthetic mousemove events, so leaving
  // it on makes preview popups flash constantly while the user is just trying
  // to move the map — the "too responsive, snaps up something while moving"
  // complaint. Cached once; `(hover: hover)` is false on phones/tablets.
  const canHoverRef = useRef<boolean | null>(null);
  // activeCats starts EMPTY (was: pre-seeded from the mode's default
  // category set). The internal category filter is now opt-in via
  // the Layers panel; the primary filter mechanism on /browse is
  // the intent chip strip at the top (Coffee / Eat / Outdoors / etc),
  // which works server-side through the URL ?intent= param. Seeding
  // activeCats with mode defaults caused a double-filter bug: tapping
  // "Outdoors" filtered server-side to park/trail places, then the
  // visitor-default activeCats (["food", "arts", "parking"]) filtered
  // those out → zero pins rendered. Empty default lets every intent
  // chip work; the user opts INTO category narrowing if they want it.
  // Remembered layer choices (per device). Read ONCE on mount — layers on top
  // of the clean cold open without reversing it: only explicit prior choices
  // restore, a first-timer still gets the clean default, deep-links win below.
  const [layerPrefs] = useState(readMapLayerPrefs);
  const [activeCats, setActiveCats] = useState<Set<string>>(() => new Set(layerPrefs.cats ?? []));
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>(osmFromProps ?? loadCachedOsm() ?? []);
  const [osmLoading, setOsmLoading] = useState(osmPlaces.length === 0);
  // P0-10: a fatal Mapbox failure (missing/invalid token, style auth)
  // must degrade to a stable branded state, never a blank rectangle.
  const [mapError, setMapError] = useState(false);
  // P0-10: a graceful note when the user denies (or we cannot get)
  // geolocation, instead of the "Near me" button silently doing nothing.
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [osmError, setOsmError] = useState<string | null>(null);
  // Cold open is CLEAN: no layers pre-selected (matching the empty-categories
  // decision above) so the map opens as the live town, not a wall of pins. The
  // mode toggle still applies its curated layers when the user picks a mode.
  // Cold open is normally CLEAN, but a deep-link (/map?amenity=restroom from
  // /amenities or /today) pre-activates those groups and opens the tray so the
  // requested amenity layer is on at first paint.
  const [amenityGroups, setAmenityGroups] = useState<Set<string>>(
    // Deep-link (?amenity=) wins; otherwise restore the remembered set.
    () => new Set(initialAmenityGroups ?? layerPrefs.amenities ?? []),
  );
  const [amenityOpen, setAmenityOpen] = useState(
    (initialAmenityGroups?.length ?? layerPrefs.amenities?.length ?? 0) > 0,
  );
  // The category rail is heavy; collapsed by default so the in-map
  // deck stays a clean glass bar. "Filters" reveals it as a panel.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventPin | null>(null);
  const [q, setQ] = useState("");
  const [userLoc, setUserLoc] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [showCivic, setShowCivic] = useState(() => layerPrefs.civic ?? false);
  const [showTrails, setShowTrails] = useState(() => layerPrefs.trails ?? false);
  const [showTransit, setShowTransit] = useState(
    () => layerPrefs.transit ?? initialDefaults.lineLayers.includes("transit"),
  );
  // Aerial photo overlay — the Frederick Radius moat. Off by default
  // since 104 pins is a lot to render until the user opts in. Tapping
  // one opens a Popup with the photo thumbnail + season + date.
  const [showAerial, setShowAerial] = useState(() => layerPrefs.aerial ?? false);
  const [selectedAerial, setSelectedAerial] = useState<AerialPhoto | null>(null);
  // Time machine: which season's drone shots are lit. "all" shows every
  // pin; a season fades the others out (cross-fade, not a hard cut).
  const [aerialSeason, setAerialSeason] = useState<AerialSeason>("all");
  // Mapbox paint transitions ignore the prefers-reduced-motion media
  // query, so gate the cross-fade duration ourselves to honor it.
  const aerialFade = (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) ? 0 : 450;
  // Tap-a-town: the municipality under the last empty-map tap (name +
  // tap point for the popup anchor). Null when no town sheet is open.
  const [civicTown, setCivicTown] = useState<{ name: string; lng: number; lat: number } | null>(null);

  // Remember the user's explicit layer choices (per device) so a customized map
  // survives reload. Transient focus filters (saved-only / field-notes-only)
  // are intentionally excluded — see mapLayerPrefs.
  useEffect(() => {
    writeMapLayerPrefs({
      cats: [...activeCats],
      amenities: [...amenityGroups],
      civic: showCivic,
      transit: showTransit,
      trails: showTrails,
      aerial: showAerial,
    });
  }, [activeCats, amenityGroups, showCivic, showTransit, showTrails, showAerial]);

  // GIS overlays (6.3/6.4): the toggleable layer set, dark by default.
  // The active set lives in the URL (?layers=art,parks) so a view is
  // shareable; MapOverlays lazy-loads and renders each active layer.
  const [activeOverlays, setActiveOverlays] = useState<OverlayKey[]>([]);
  useEffect(() => {
    setActiveOverlays(parseLayersParam(new URLSearchParams(window.location.search).get("layers")));
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const v = serializeLayers(activeOverlays);
    if (v) url.searchParams.set("layers", v);
    else url.searchParams.delete("layers");
    window.history.replaceState(null, "", url.toString());
  }, [activeOverlays]);
  const toggleOverlay = (k: OverlayKey) => {
    track("map_layer", { layer: k, on: !activeOverlays.includes(k) });
    setActiveOverlays((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  };

  // Saved-only lens (continuity P2): filter the pins to the user's own
  // saved places, so the map can be read as a personal field guide.
  // useFollowedSlugs covers both the anonymous localStorage path and the
  // signed-in follows DB; the chip renders only when something is saved.
  const { slugs: followedSlugs } = useFollowedSlugs();
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  // Field-notes lens: pins narrowed to places that carry VERIFIED Field Notes
  // (happy hour / deal / parking / insider) — the moat, browsable on the map.
  // Like the saved lens, it's a deliberate selection that shows its set even
  // with no category active.
  const [fieldNotesOnly, setFieldNotesOnly] = useState(false);

  // On mode flip (user tapped the toggle, or geo suggestion landed):
  // reset every layer-toggle to the new mode's defaults. We deliberately
  // do NOT preserve the prior session's manual toggles — the brief calls
  // out predictability over preservation. The first-render guard uses
  // a ref so the initial useState seeding above is not double-applied.
  // Mode no longer pre-seeds MAP LAYERS — neither on open nor on switch. The
  // map opens clean (no layers selected) and the user opts into every layer;
  // a post-mount mode hydration used to re-apply the visitor defaults
  // (restroom + trails) and re-clutter the clean open. Mode still scopes the
  // events + closures (via defaultsFor in mode-scope), just not the layer set.
  // (Categories were already removed from this sync for the same reason.)

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

  const filteredPlaces = useMemo(() => {
    let base = places;
    // Field-notes lens narrows the base set first, so it intersects cleanly
    // with both the saved lens and category chips below.
    if (fieldNotesOnly) base = base.filter((p) => p.field_notes);
    // Saved-only lens: a deliberate selection, so it shows the whole
    // saved set even with no category active (it overrides the
    // pinpoint-first empty state); category chips still intersect.
    if (showSavedOnly) {
      base = base.filter((p) => followedSlugs.has(p.slug));
      if (activeCats.size === 0) return base;
    } else if (activeCats.size === 0) {
      // The field-notes lens is also deliberate — show its whole set with no
      // category active, the way the saved lens does.
      if (fieldNotesOnly) return base;
      // Pinpoint-first: a clean map until the user adds a category. When a
      // server-side intent already pre-filtered `places` (pinpointDefault
      // false), empty activeCats still means "show the whole filtered set."
      return pinpointDefault ? [] : base;
    }
    return base.filter((p) => {
      const cat = CATEGORY_BY_SLUG[p.category];
      return activeCats.has(p.category) || (cat?.parent && activeCats.has(cat.parent));
    });
  }, [places, activeCats, pinpointDefault, showSavedOnly, followedSlugs, fieldNotesOnly]);

  // How many places carry Field Notes — drives the lens chip's count.
  const fieldNotesCount = useMemo(() => places.filter((p) => p.field_notes).length, [places]);

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
    // Always filter known-closed places (manual denylist) — even from the
    // unverified opt-in view. We never want to show a closed business as open.
    // Trusted-only: the "+N unverified" opt-in was retired — exposing
    // weaker-quality OSM data violated the editorial promise.
    let pool = osmPlaces.filter((p) => !isKnownClosed(p.name));
    pool = pool.filter(isTrustedOsm);
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
  }, [osmPlaces, activeCats, osmDupesCurated]);

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
          // Carries a community-report's reference photo through to the popup
          // (OSM amenities have none; the field reports the /report tool adds do).
          photo: p.photo ?? "",
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
          // Reference photo (field-collected points only) — surfaced in the
          // popup. Empty string for OSM/static amenities.
          photo: a.photo ?? "",
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
        color: CATEGORY_BY_SLUG[p.category]?.color ?? "#E14328",
        bucket: bucketOf(p.category),
        // "Last call" — open now but closing within the hour. Drives a
        // soft amber halo so a glance catches what's about to close.
        closing: p.open_status?.state === "closing-soon",
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
            properties: { color: CATEGORY_BY_SLUG[p.category]?.color ?? "#E14328" },
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
    setCivicTown(null); // any tap dismisses a prior town sheet
    const feature = e.features?.[0];
    if (!feature) {
      setSelectedSlug(null);
      // Tap empty map -> which town am I in? Point-in-polygon against the
      // municipal boundaries already drawn, then open a compact civic sheet.
      const { lng, lat } = e.lngLat;
      const hit = municipalBoundaries.features.find(
        (f) => f.geometry && pointInPolygonGeom(lng, lat, f.geometry as GeoJSON.Geometry),
      );
      const name = hit?.properties?.name ? String(hit.properties.name) : "";
      if (name) { setCivicTown({ name, lng, lat }); haptic("light"); }
      return;
    }
    const layer = feature.layer?.id;
    if (!layer) { setSelectedSlug(null); return; }
    const map = mapRef.current?.getMap();

    // Cluster expansion — works for both OSM and curated clusters
    if ((layer === "clusters" || layer === "curated-clusters") && map) {
      setSelectedSlug(null);
      track("map_cluster");
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

    if (layer === "curated-icons" || layer === "curated-hit") {
      const props = feature.properties as Record<string, string>;
      const place = places.find((p) => p.slug === props.slug);
      setSelectedSlug(props.slug);
      haptic("light");
      // Google-Maps-style: tap a pin → full card slides up from the bottom
      // (photo, rating, hours, directions, save) instead of a cramped popup.
      // Distance must be from the USER, never a fixed city point — show it
      // only when we actually have their location, else omit it (honest).
      if (place) openSheet(userLoc ? { ...place, distance_m: haversineMeters(userLoc, place.geom) } : place);
      track("map_pin", { category: place?.category ?? "unknown" });
      return;
    }

    if (layer === "aerial-icons") {
      const idx = Number(feature.properties?.idx);
      const photo = AERIAL_PHOTOS[idx];
      if (photo) {
        haptic("light");
        setSelectedAerial(photo);
      }
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
        photo: props.photo || undefined,
        lng: (feature.geometry as GeoJSON.Point).coordinates[0] as number,
        lat: (feature.geometry as GeoJSON.Point).coordinates[1] as number,
      });
    }
  };

  // Lightweight hover preview: name (and category) of the pin under the
  // pointer, so the map is scannable without clicking every icon.
  const onHover = (e: MapMouseEvent) => {
    if (canHoverRef.current === null) {
      canHoverRef.current =
        typeof window !== "undefined" &&
        window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
    }
    if (!canHoverRef.current) return; // touch device: no hover preview while panning
    const f = e.features?.[0];
    if (!f || !f.layer?.id) { setHover((h) => (h ? null : h)); return; }
    const props = (f.properties ?? {}) as Record<string, string | number>;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    let next: { lng: number; lat: number; label: string; sub?: string } | null = null;
    if (f.layer.id === "clusters" || f.layer.id === "curated-clusters") {
      next = { lng, lat, label: "A cluster of places" };
    } else if (f.layer.id === "curated-icons" || f.layer.id === "curated-hit") {
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
  // OSM amenities are flaky (live Overpass; empty in the sandbox). The
  // curated amenities.json is always present, so the Amenities tray is
  // gated on EITHER source having points — that is the fix for "I
  // don't see the water fountains / things we just added".
  const amenityCount = osmPlaces.filter(isAmenity).length + amenities.length;
  const activeAmenityGroupCount = amenityGroups.size;

  // On-map search — match places already on the map by name/address/city.
  // Unified search (one-search): the map bar asks the same /api/search
  // the TopBar overlay does, so the two bars can never give different
  // answers. Places focus the map; events, towns, and categories
  // navigate; a layer result toggles the overlay right here. Debounced
  // 150ms to match SearchOverlay; stale responses are dropped.
  const router = useRouter();
  const [searchMatches, setSearchMatches] = useState<SearchResult[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSearchMatches([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}&limit=6`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((d: SearchResult[]) => setSearchMatches(Array.isArray(d) ? d : []))
        .catch(() => {
          /* aborted or offline — keep the previous list */
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const placesBySlug = useMemo(() => {
    // globalThis.Map: the bare `Map` is react-map-gl's component here.
    const m = new globalThis.Map<string, PlaceCardData>();
    for (const p of places) m.set(p.slug, p);
    return m;
  }, [places]);

  const pickSearch = (r: SearchResult) => {
    haptic("light");
    // A layer result toggles the overlay in place — no navigation.
    const layer = r.id.startsWith("layer:") ? (r.id.slice(6) as OverlayKey) : null;
    if (layer) {
      setActiveOverlays((cur) => (cur.includes(layer) ? cur : [...cur, layer]));
      setQ("");
      return;
    }
    // A place that's on this map focuses it; anything else (events,
    // towns, categories, places outside the loaded set) navigates.
    if (r.type === "place") {
      const p = placesBySlug.get(r.id.replace(/^place:/, ""));
      if (p) {
        const map = mapRef.current?.getMap();
        setSelectedSlug(p.slug);
        setQ("");
        if (map) smoothFocus(map, [p.geom.lng, p.geom.lat], { minZoom: 15 });
        openSheet(userLoc ? { ...p, distance_m: haversineMeters(userLoc, p.geom) } : p);
        return;
      }
    }
    router.push(r.href);
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

  // Depends on scopedCivic directly (which itself folds in civic +
  // showCivic + mode). The previous deps array `[civic, showCivic]`
  // missed `mode`, so flipping Visitor↔Resident could leave the
  // GeoJSON pointing at the previous scoping until the next civic
  // update landed.
  const civicGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: scopedCivic.map((c) => ({
      type: "Feature" as const,
      properties: { kind: c.kind, label: c.label },
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
    })),
  }), [scopedCivic]);

  // Aerial photo GeoJSON. Built once at module mount since the
  // manifest doesn't change between renders. The `idx` carried in
  // properties lets the click handler resolve back to the manifest
  // entry without storing each photo's URL in feature properties.
  const aerialGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: AERIAL_PHOTOS.map((p, idx) => ({
      type: "Feature" as const,
      properties: { idx, season: p.season },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  }), []);

  const goNearMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const loc = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        haptic("light");
        track("map_locate", { in_county: isInFrederickCounty(loc.lng, loc.lat) });
        // County lock (6.2): a user physically outside Frederick County
        // gets the county itself, centered on downtown, not a flight to
        // an out-of-area "you are here" the leash would then fight. We
        // also skip the user-location pin and radius in that case, since
        // there is nothing in range to anchor.
        if (!isInFrederickCounty(loc.lng, loc.lat)) {
          setUserLoc(null);
          setGeoMsg("You are outside Frederick County. Showing downtown Frederick.");
          mapRef.current?.getMap().flyTo({
            center: FREDERICK,
            zoom: 12,
            duration: 1100,
            curve: 1.25,
            easing: CAM_EASE,
            essential: true,
          });
          return;
        }
        setGeoMsg(null);
        setUserLoc(loc);
        // A deliberate in-county recenter, eased with the same curve as
        // every other move so it still feels calm, not a snap.
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
            ? "Location is off. Enable it in your browser to use Near me."
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
      <AppMapDeck
        q={q}
        setQ={setQ}
        searchMatches={searchMatches}
        pickSearch={pickSearch}
        goNearMe={goNearMe}
        locating={locating}
        userLoc={userLoc}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        activeCats={activeCats}
        setActiveCats={setActiveCats}
        amenityOpen={amenityOpen}
        setAmenityOpen={setAmenityOpen}
        amenityGroups={amenityGroups}
        setAmenityGroups={setAmenityGroups}
        amenityCount={amenityCount}
        activeAmenityGroupCount={activeAmenityGroupCount}
        places={places}
        trustedOsmCount={trustedOsmCount}
        civic={civic}
        showCivic={showCivic}
        setShowCivic={setShowCivic}
        transitLines={transitLines}
        showTransit={showTransit}
        setShowTransit={setShowTransit}
        trailLines={trailLines}
        showTrails={showTrails}
        setShowTrails={setShowTrails}
        showAerial={showAerial}
        setShowAerial={setShowAerial}
        aerialCount={AERIAL_PHOTOS.length}
        activeOverlays={activeOverlays}
        toggleOverlay={toggleOverlay}
        savedCount={followedSlugs.size}
        showSavedOnly={showSavedOnly}
        setShowSavedOnly={setShowSavedOnly}
        fieldNotesCount={fieldNotesCount}
        fieldNotesOnly={fieldNotesOnly}
        setFieldNotesOnly={setFieldNotesOnly}
      />

        {/* Pinpoint-first empty state — the control surface. With nothing
            added, the map is calm and this invites the user to compose
            what they want to see. Tapping a category drops its pins
            instantly (toggles activeCats); the prompt then disappears. */}
        {/* The empty-state "What do you want to see?" card was removed in
            the browse-map declutter: the intent chip row at the top is now
            the single "pick what to see" control (chips-led), so the map
            opens clean with one slim chip row instead of a big card layered
            over a preset bar. The chips populate the map on tap; Layers
            still toggles individual categories. */}

        {mapError && (
          <div
            className="absolute inset-0 z-[var(--z-map-control)] flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ background: "var(--app-bg)" }}
            role="alert"
          >
            <p className="font-serif text-base font-semibold" style={{ color: "var(--app-ink)" }}>
              The map is temporarily unavailable
            </p>
            <p className="max-w-xs text-xs leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              It should be back shortly. Reload, or browse every place in the county by list.
            </p>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                Reload the map
              </button>
              <Link
                href="/places"
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
                style={{ background: "var(--app-brand-press)" }}
              >
                Browse all places
              </Link>
            </div>
          </div>
        )}
        {geoMsg && (
          <div
            className="absolute bottom-3 left-1/2 z-[var(--z-map-control)] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-white/95 px-3 py-1.5 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            role="status"
          >
            {geoMsg}
            <button type="button" onClick={() => setGeoMsg(null)} aria-label="Dismiss" style={{ color: "var(--app-ink-3)" }}>✕</button>
          </div>
        )}
        {/* Transient OSM status only — loading + error. The old steady-state
            "{N} verified OSM places" chip was a permanent floating count with
            no tap target (pure top-left noise once everything had loaded), so
            on a healthy map nothing shows here now. */}
        {(osmLoading || osmError) && (
          <div
            className="absolute left-3 top-3 z-[var(--z-map-control)] inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur"
            style={{ color: "var(--app-ink-2)" }}
            aria-live="polite"
          >
            {osmLoading ? (
              <>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: "var(--app-cool)" }} />
                Loading public places from OpenStreetMap…
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--app-warning)" }} />
                Couldn&apos;t reach OSM; showing curated only
              </>
            )}
          </div>
        )}
        {/* Directions chip — distance + drive estimate + native handoff */}
        {routeInfo && (
          <div className="absolute inset-x-0 top-3 z-[var(--z-map-control)] flex justify-center px-3">
            <a
              href={routeInfo.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic("light")}
              // Capped so a long venue name can't stretch the chip into the
              // top-right zoom controls; the name itself truncates within it.
              className="inline-flex max-w-[calc(100%-7rem)] items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold shadow-[var(--app-shadow-2)] backdrop-blur"
              style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.95)", color: "var(--app-ink-2)" }}
            >
              <span aria-hidden style={{ color: "var(--app-cool)" }}>→</span>
              <span className="truncate">{routeInfo.name}</span>
              <span style={{ color: "var(--app-ink-3)" }}>
                {routeInfo.dist} · ~{routeInfo.drive} min drive
              </span>
              <span style={{ color: "var(--app-cool)" }}>Directions ↗</span>
            </a>
          </div>
        )}

        {/* Aerial time machine — scrub the drone archive by season.
            Only present while the aerial layer is on; selecting a season
            cross-fades the pins (handled by the layer opacity transition
            above) so the county visibly shifts spring -> winter. */}
        {showAerial && (
          <div
            className="absolute bottom-[116px] left-1/2 z-[var(--z-map-control)] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border px-1.5 py-1.5 shadow-[var(--app-shadow-2)] backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.95)" }}
            role="group"
            aria-label="Aerial photos by season"
          >
            {AERIAL_SEASONS.map((s) => {
              const on = aerialSeason === s.key;
              const count = s.key === "all" ? AERIAL_PHOTOS.length : (AERIAL_SEASON_COUNTS[s.key] ?? 0);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setAerialSeason(s.key); haptic("light"); }}
                  aria-pressed={on}
                  className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.96]"
                  style={{ background: on ? s.color : "transparent", color: on ? "#fff" : "var(--app-ink-2)" }}
                >
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "#fff" : s.color }} />
                  {s.label}
                  {on && <span className="tabular-nums font-medium" style={{ opacity: 0.85 }}>{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Legend retired — the floating button competed with the map
            and never carried real signal. The category color band on
            each pin + the in-view drawer's place cards are the legend
            now. */}

        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={
            urlCamera ?? {
              longitude: effectiveCenter[0],
              latitude: effectiveCenter[1],
              zoom: initialZoom,
            }
          }
          mapStyle={MAP_BAKED_STYLE ? (BAKED_STYLE as unknown as StyleSpecification) : STYLE_URL}
          style={{ width: "100%", height: "100%" }}
          attributionControl={true}
          // ── Mobile-smoothness flags ──
          // This is a flat 2D county map: rotation and pitch only ever
          // happen by accident on a two-finger pan, leaving the user
          // staring at a tilted, spun map they can't easily un-tilt.
          // Locking both keeps every gesture a clean pan/zoom.
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          // Leash the camera to the county (+ buffer) so flings don't
          // sail off into empty tiles the user then has to scroll back
          // from — and so the place set always has context on screen.
          maxBounds={FREDERICK_MAX_BOUNDS}
          minZoom={FREDERICK_MIN_ZOOM}
          maxZoom={FREDERICK_MAX_ZOOM}
          // Don't tear down + re-create the GL context when the map
          // unmounts (mode toggle, route change) — reusing it makes the
          // map snap back instantly instead of cold-booting Mapbox.
          reuseMaps
          // Snappier label transitions on pan/zoom (default is 300ms).
          fadeDuration={120}
          // The terrain/fog combo we previously had assumed Standard's
          // built-in mapbox-dem source. On dark-v11 that source isn't
          // included, so terrain silently no-ops; applyFrederickPalette
          // installs its OWN raster-dem source (fr-dem) and a hillshade
          // LAYER that paints relief over the Catoctin + South Mountain
          // ridges. The result reads as terrain-aware without the cost
          // of a 3D mesh, and keeps wayfinding crisp at every zoom.
          interactiveLayerIds={["clusters", "osm-icons", "amenity-icons", "curated-clusters", "curated-icons", "curated-hit", "aerial-icons"]}
          onClick={onClick}
          onLoad={(e) => {
            installCategoryMarkers(e.target);
            // Brand repaint. The palette rewrites stock light-v11 into the
            // Frederick Radius design — paper-cream land, civic-blue water,
            // suppressed POI clutter (our own pins are the points of
            // interest), warm hillshade across the Catoctin + South Mountain
            // ridges. This is the difference between "Mapbox light style" and
            // "Frederick Radius map."
            //
            // Two paths: the baked style (flag on) already carries the palette
            // as static JSON, so we skip the ~50-layer runtime walk and only
            // install the two things the JSON can't hold — the hillshade relief
            // (a live raster-dem source) and the county spotlight. Flag off
            // keeps the proven runtime recolor.
            if (MAP_BAKED_STYLE) installRelief(e.target);
            else applyFrederickPalette(e.target);
            // Frame browse mode in the county too, the same veil + drawn
            // border the radius map already wears, so the two modes feel
            // like one place and not two different maps.
            installCountySpotlight(e.target);
            markMapOnLoad();
            emitInView();
          }}
          onMoveEnd={(e) => {
            markMapIdleOnce();
            emitInView();
            // Persist the camera to the URL so the view is shareable and
            // survives reload. moveend is already debounced by Mapbox, so
            // this writes once per settled move; replaceState preserves the
            // sibling `layers` param.
            try {
              const c = e.target.getCenter();
              const url = new URL(window.location.href);
              url.searchParams.set("c", `${c.lng.toFixed(4)},${c.lat.toFixed(4)},${e.target.getZoom().toFixed(2)}`);
              window.history.replaceState(null, "", url.toString());
            } catch {
              /* URL write is best-effort */
            }
          }}
          onError={(e) => {
            const msg = String(e?.error?.message ?? "");
            if (/access token|unauthorized|forbidden|\b40[13]\b|failed to (fetch|load)/i.test(msg)) {
              setMapError(true);
            }
          }}
          onMouseMove={onHover}
          onMouseLeave={() => setHover(null)}
        >
          {/* (Removed an orphaned mapbox-dem raster-dem Source: there is no
              `terrain` prop on <Map> — see the note above — and
              applyFrederickPalette installs its own `fr-dem` source + hillshade,
              so this was a duplicate terrain-DEM tile pyramid with no consumer.) */}
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
                "line-color": "#20506A",
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3, 17, 5],
                "line-opacity": 0.75,
              }}
            />
          </Source>
          {/* Live TransIT vehicles — real GTFS-realtime positions, ALWAYS on
              (decoupled from the transit route-line toggle) so the map opens as
              a living town with the buses moving, even with no layers selected.
              Eases between polls; honest empty when the feed reports no buses
              (evenings/weekends run sparse). The transit toggle adds the route
              LINES under them. */}
          <LiveBuses show />
          <Source id="trail-lines" type="geojson" data={(showTrails ? trailLines : EMPTY_LINE_FC) as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="trail-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#1E6B3A",
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2.5, 17, 4],
                "line-opacity": 0.7,
                "line-dasharray": [2, 1.5],
              }}
            />
          </Source>
          {/* GIS overlays (6.3/6.4): parks, farmers markets, public art.
              Self-contained (lazy fetch, own Sources/Layers, own click
              popups) so this block stays out of the main render path. */}
          <MapOverlays active={activeOverlays} />
          {/* County boundary — the quiet always-on county edge (6.1).
              Committed static GIS polygon, drawn as an outline UNDER the
              municipal lines and pins so the map reads as a county field
              guide. A touch heavier than the muni dashes, still calm. */}
          <Source
            id="county-boundary"
            type="geojson"
            data={countyBoundary as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="county-boundary-line"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": "#423E34",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 13, 2 ],
                "line-opacity": 0.4,
              }}
            />
          </Source>
          {/* Municipal boundaries — authoritative county GIS polygons,
              rendered as a quiet always-on outline so a user can see
              which town they are panning through (replacing the old
              centroid-label-only orientation). Drawn BELOW the place
              pins, low opacity, so it orients without competing. */}
          <Source
            id="municipal-boundaries"
            type="geojson"
            data={municipalBoundaries as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="municipal-boundary-line"
              type="line"
              layout={{ "line-join": "round" }}
              paint={{
                "line-color": "#5C5A50",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 13, 1.4],
                "line-opacity": 0.35,
                "line-dasharray": [3, 2],
              }}
            />
            {/* Tap-a-town highlight: the tapped municipality's outline
                lights up in brand cool and fades in (opacity transition)
                as the civic sheet rises. Filtered to nothing when closed. */}
            <Layer
              id="municipal-boundary-highlight"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              filter={["==", ["get", "name"], civicTown?.name ?? "__none__"]}
              paint={{
                "line-color": "#20506A",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 3.5],
                "line-opacity": civicTown ? 0.9 : 0,
                "line-opacity-transition": { duration: aerialFade, delay: 0 },
              }}
            />
          </Source>

          {/* Tap-a-town civic sheet — "you're in {town}", the key contacts
              (town hall, trash, ...) and a link to the town guide. Resolved
              by point-in-polygon in onClick; honest when a town has no
              civic record yet. */}
          {civicTown && (() => {
            // Boundary "MUNIC" name -> municipality. Handles "Frederick
            // City" -> slug "frederick" and our "Downtown Frederick" naming
            // by stripping the city/town suffix and the downtown- prefix.
            const base = townSlug(civicTown.name.replace(/\b(city|town|village)\b/gi, " "));
            const muni =
              MUNICIPALITIES.find((m) => m.slug === base) ??
              MUNICIPALITIES.find((m) => townSlug(m.name).replace(/^downtown-/, "") === base) ??
              null;
            const rec = muni ? municipalCivicFor(muni.slug) : null;
            const contacts = rec ? civicContacts(rec).slice(0, 2) : [];
            const title = muni?.name ?? civicTown.name;
            return (
              <Popup
                longitude={civicTown.lng}
                latitude={civicTown.lat}
                offset={14}
                closeOnClick={false}
                onClose={() => setCivicTown(null)}
                maxWidth="250px"
              >
                <div style={{ padding: "2px 2px 4px", minWidth: 198 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--app-cool, #20506A)", margin: 0 }}>
                    You&rsquo;re in
                  </p>
                  <strong className="font-serif" style={{ display: "block", fontSize: 18, lineHeight: 1.15, color: "var(--app-ink, #16140E)", marginTop: 1 }}>
                    {title}
                  </strong>
                  {contacts.length > 0 ? (
                    <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 5 }}>
                      {contacts.map((c) => (
                        <div key={c.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                          <span style={{ color: "var(--app-ink-2, #423E34)" }}>{c.label}</span>
                          {c.phone ? (
                            <a href={`tel:${c.phone.replace(/[^0-9]/g, "")}`} style={{ color: "var(--app-cool, #20506A)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.phone}</a>
                          ) : c.website ? (
                            <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--app-cool, #20506A)", fontWeight: 600 }}>Visit ↗</a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ marginTop: 6, fontSize: 12, color: "var(--app-ink-3, #5C5A50)" }}>
                      Civic details coming soon for {title}.
                    </p>
                  )}
                  {muni && (
                    <Link href={`/m/${muni.slug}`} style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--app-brand, #E14328)" }}>
                      {title} guide &rarr;
                    </Link>
                  )}
                </div>
              </Popup>
            );
          })()}

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
                "circle-color": "#20506A",
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
                "circle-color": "#20506A",
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
           * Micro-amenities. Clustered so the layer scales: at the
           * county view a downtown amenity cluster reads as one dot,
           * unfolding into individual restroom/trash/bench icons as
           * the user zooms in. Previously gated to minzoom 12 with no
           * clustering, which made selected groups *invisible* at the
           * default county view — the most common bug report. Now
           * starts at minzoom 10 with cluster aggregation so the
           * layer is meaningful at every zoom.
           */}
          <Source
            id="amenities"
            type="geojson"
            data={amenityGeoJson}
            cluster
            clusterRadius={48}
            clusterMaxZoom={13}
          >
            {/* Cluster disc — cool civic tint, with a count label */}
            <Layer
              id="amenity-clusters"
              type="circle"
              minzoom={10}
              filter={["has", "point_count"]}
              paint={{
                "circle-color": "#2F5470",
                "circle-opacity": 0.5,
                "circle-blur": 0.25,
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "point_count"],
                  2, 8, 20, 12, 100, 16,
                ],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1,
                "circle-stroke-opacity": 0.35,
              }}
            />
            <Layer
              id="amenity-cluster-counts"
              type="symbol"
              minzoom={10}
              filter={["all", ["has", "point_count"], [">=", ["get", "point_count"], 3]]}
              layout={{
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 10,
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
              }}
              paint={{
                "text-color": "#FFFFFF",
                "text-halo-color": "rgba(0,0,0,0.3)",
                "text-halo-width": 1,
              }}
            />
            <Layer
              id="amenity-icons"
              type="symbol"
              // Share the cluster floor (z10): below this the whole amenity layer
              // is off, but between z10 and z11 clusters were visible while a lone
              // (unclustered) amenity silently vanished. Icons now appear wherever
              // clusters do, so a toggled layer is never partially invisible.
              minzoom={10}
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  10, 0.20,
                  11, 0.22,
                  13, 0.30,
                  15, 0.42,
                  17, 0.56,
                ],
                // Collision-declutter at every zoom so dense blocks of
                // amenity bins stay readable as you zoom in.
                "icon-allow-overlap": false,
                "icon-anchor": "center",
              }}
              paint={{ "icon-opacity": 0.94 }}
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
                    ["==", ["var", "mx"], 0], "#E14328",
                    ["==", ["get", "food"], ["var", "mx"]], BUCKET_COLOR.food,
                    ["==", ["get", "outdoors"], ["var", "mx"]], BUCKET_COLOR.outdoors,
                    ["==", ["get", "arts"], ["var", "mx"]], BUCKET_COLOR.arts,
                    ["==", ["get", "shopping"], ["var", "mx"]], BUCKET_COLOR.shopping,
                    ["==", ["get", "civic"], ["var", "mx"]], BUCKET_COLOR.civic,
                    "#E14328",
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
                    ["==", ["var", "mx"], 0], "#E14328",
                    ["==", ["get", "food"], ["var", "mx"]], BUCKET_COLOR.food,
                    ["==", ["get", "outdoors"], ["var", "mx"]], BUCKET_COLOR.outdoors,
                    ["==", ["get", "arts"], ["var", "mx"]], BUCKET_COLOR.arts,
                    ["==", ["get", "shopping"], ["var", "mx"]], BUCKET_COLOR.shopping,
                    ["==", ["get", "civic"], ["var", "mx"]], BUCKET_COLOR.civic,
                    "#E14328",
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
            {/* Last call — a soft amber halo under places open now but
                closing within the hour. Calm by design (a warm glow, no
                countdown, no pulse): a glance catches what's about to
                close without the map ever shouting. */}
            <Layer
              id="curated-lastcall"
              type="circle"
              filter={["all", ["!", ["has", "point_count"]], ["==", ["get", "closing"], true]]}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 9, 15, 15, 18, 20],
                "circle-color": "#B26B00",
                "circle-opacity": 0.26,
                "circle-blur": 0.55,
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
                // Pin scale by zoom. Tuned smaller across the entire
                // range after audit feedback that pins were eating the
                // map at every zoom level. The county view floor drops
                // to 0.26 (was 0.36 → 0.5 was too big at z9–10), and
                // even at street zoom we cap at ~0.95 instead of 1.1
                // so the user sees more before clutter kicks in.
                // Clusters carry the density signal at the wide view.
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  9, 0.26,
                  11, 0.36,
                  13, 0.5,
                  15, 0.72,
                  17, 0.88,
                  19, 0.95,
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
            {/* Invisible tap-target pad — expands each curated pin's
                hit area to a Fitts-friendly ~36px regardless of how
                tiny the rendered icon gets at street zoom. The single-
                place pins shrink under the iOS 44pt floor; this layer
                keeps the touchable region usable without making the
                visual pins themselves bigger. Same source as
                curated-icons so the click handler can resolve back to
                the same slug via props.slug. */}
            <Layer
              id="curated-hit"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": "#000000",
                "circle-opacity": 0,
                "circle-radius": 18,
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
              paint={{ "fill-color": "#E14328", "fill-opacity": 0.07 }}
            />
            <Layer
              id="ring-line"
              type="line"
              beforeId="curated-clusters"
              paint={{
                "line-color": "#E14328",
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
              paint={{ "circle-radius": 13, "circle-color": "#20506A", "circle-opacity": 0.22 }}
            />
            <Layer
              id="dot-core"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": "#20506A",
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
                "line-color": "#20506A",
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
                "circle-color": ["match", ["get", "kind"], "traffic", "#C99632", "#20506A"],
                "circle-opacity": 0.22,
              }}
            />
            <Layer
              id="civic-core"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": ["match", ["get", "kind"], "traffic", "#C99632", "#20506A"],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.8,
              }}
            />
          </Source>

          {/* Aerial photo overlay — every georeferenced drone shot
              in /public/images/seasons/ as a season-tinted pin. Tap
              one and the Popup below shows the actual photo + the
              date it was taken. No other map can show this; it's
              powered by the EXIF GPS in the user's own photo
              archive. Halo + core matches the civic-pin pattern so
              the styling reads as part of the same family. */}
          <Source
            id="aerial"
            type="geojson"
            data={(showAerial ? aerialGeoJson : { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="aerial-halo"
              type="circle"
              paint={{
                "circle-radius": 10,
                // Tint by season — spring sage, summer warm-gold,
                // fall brick, winter cool-slate. Reads as a year of
                // Frederick instead of a uniform pin set.
                "circle-color": [
                  "match",
                  ["get", "season"],
                  "spring", "#859076",
                  "summer", "#C99632",
                  "fall", "#A03A22",
                  "winter", "#2F5470",
                  "#A03A22",
                ],
                "circle-opacity":
                  aerialSeason === "all"
                    ? 0.22
                    : ["case", ["==", ["get", "season"], aerialSeason], 0.22, 0],
                "circle-opacity-transition": { duration: aerialFade, delay: 0 },
              }}
            />
            <Layer
              id="aerial-icons"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": [
                  "match",
                  ["get", "season"],
                  "spring", "#859076",
                  "summer", "#C99632",
                  "fall", "#A03A22",
                  "winter", "#2F5470",
                  "#A03A22",
                ],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.6,
                "circle-opacity":
                  aerialSeason === "all"
                    ? 1
                    : ["case", ["==", ["get", "season"], aerialSeason], 1, 0],
                "circle-opacity-transition": { duration: aerialFade, delay: 0 },
                "circle-stroke-opacity":
                  aerialSeason === "all"
                    ? 1
                    : ["case", ["==", ["get", "season"], aerialSeason], 1, 0],
                "circle-stroke-opacity-transition": { duration: aerialFade, delay: 0 },
              }}
            />
          </Source>

          {/* Aerial photo popup — fires when the user taps a pin in
              the Aerial photos overlay. Shows the photo thumbnail at
              a generous size + the season tag + the capture date.
              Designed to feel like opening a postcard from the spot
              the pin marks. */}
          {selectedAerial && (
            <Popup
              longitude={selectedAerial.lng}
              latitude={selectedAerial.lat}
              anchor="bottom"
              offset={20}
              closeOnClick={true}
              onClose={() => setSelectedAerial(null)}
              maxWidth="320px"
            >
              <div className="space-y-2">
                <div
                  className="relative w-full overflow-hidden rounded-[var(--app-radius-md)]"
                  style={{ aspectRatio: "16/9" }}
                >
                  {/* Plain <img> — Mapbox popup content sits outside
                      Next's <Image> component, but we can still hit the
                      optimizer endpoint directly: the source is a full
                      1920×1080 jpeg and the card is ~320px wide, so a
                      640px variant (2× DPR) is a fraction of the bytes. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sizedImage(selectedAerial.src, 640)}
                    alt={`Aerial photo, ${selectedAerial.season}`}
                    width={320}
                    height={180}
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-baseline justify-between gap-2 px-0.5">
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.12em]"
                    style={{
                      color: ({
                        spring: "#859076",
                        summer: "#C99632",
                        fall: "#A03A22",
                        winter: "#2F5470",
                      }[selectedAerial.season]) ?? "#A03A22",
                    }}
                  >
                    {selectedAerial.season}
                  </p>
                  {selectedAerial.takenAt && (
                    <p
                      className="text-[11px] tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(selectedAerial.takenAt))}
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          )}

          {/* Event pins — the Frederick-only differentiator vs Google/
              Apple Maps. Each event in the next 48h plotted at its venue
              as a circular photo bubble (or category-colored badge when
              there's no hero image). Tapping opens a popup with a link
              to the event detail. */}
          {events.map((e) => (
            <Marker
              key={`ev:${e.slug}`}
              longitude={e.lng}
              latitude={e.lat}
              anchor="bottom"
            >
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  haptic("light");
                  setSelected(null);
                  setSelectedEvent(e);
                }}
                aria-label={`${e.title} at ${e.venue_name}`}
                style={{
                  position: "relative",
                  display: "grid",
                  placeItems: "center",
                  width: 44,
                  height: 44,
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
                    inset: 4,
                    borderRadius: 9999,
                    background: e.category_color || "var(--app-brand)",
                    opacity: 0.32,
                    animation: "fr-ev-pulse 2.6s ease-out infinite",
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 9999,
                    background: e.hero_image
                      // 36px dot at up to 3× DPR → a 128px variant is
                      // plenty; the raw hero.jpg blob is 1–2 MB.
                      ? `center/cover no-repeat url("${sizedImage(e.hero_image, 128)}")`
                      : e.category_color || "var(--app-brand)",
                    border: `2px solid #fff`,
                    boxShadow: "var(--app-shadow-2)",
                    color: "#fff",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  {!e.hero_image && "\u{1F4C5}"}
                </span>
              </button>
            </Marker>
          ))}

          {selectedEvent && (
            <Popup
              longitude={selectedEvent.lng}
              latitude={selectedEvent.lat}
              anchor="bottom"
              offset={28}
              closeOnClick={true}
              onClose={() => setSelectedEvent(null)}
              maxWidth="280px"
            >
              <EventPopup e={selectedEvent} />
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
              closeOnClick={true}
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

