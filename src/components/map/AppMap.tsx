"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Map, {
  Popup,
  Marker,
  NavigationControl,
  GeolocateControl,
  AttributionControl,
  Source,
  Layer,
  type MapRef,
  type MapMouseEvent,
} from "react-map-gl/mapbox";
// (GeolocateControl stays imported for DOCK-LESS embeds only — on /map
// browse the dock's Where pane is locate's one home.)
import type { GeoJSONSource, StyleSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { useMode } from "@/hooks/useMode";
import { defaultsFor } from "@/lib/mode-defaults";
import { scopeClosures } from "@/lib/mode-scope";
import { ACCENTS, CATEGORY_BY_SLUG } from "@/data/categories";
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
import { WALK_LABEL_MAX_METERS, shouldFetchWalkTime, walkTimeQuery } from "@/lib/walkTime";
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
import { exposeMarkerChild } from "./markerA11y";
import BottomDrawer from "@/components/ui/BottomDrawer";
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
// One season → hue map for the chips, the GL dot paint, and the selected
// label, so the three can never drift apart. Shared hues come from ACCENTS.
const SEASON_HEX = {
  spring: "#859076",
  summer: ACCENTS.amber,
  fall: ACCENTS.terracotta,
  winter: ACCENTS.slate,
} as const;
const AERIAL_SEASONS: { key: AerialSeason; label: string; color: string }[] = [
  { key: "all", label: "All", color: "var(--app-ink-2)" },
  { key: "spring", label: "Spring", color: SEASON_HEX.spring },
  { key: "summer", label: "Summer", color: SEASON_HEX.summer },
  { key: "fall", label: "Fall", color: SEASON_HEX.fall },
  { key: "winter", label: "Winter", color: SEASON_HEX.winter },
];
const AERIAL_SEASON_COUNTS: Record<string, number> = AERIAL_PHOTOS.reduce(
  (acc, p) => ((acc[p.season] = (acc[p.season] ?? 0) + 1), acc),
  {} as Record<string, number>,
);

// Does this browser have a usable WebGL context? Mapbox GL needs one; without
// it the canvas stays blank. mapbox-gl v3 dropped the old `supported()` helper,
// so probe directly. Conservative: any throw or missing context → treat as no
// WebGL and fall back to the list view. SSR returns true so we never flash the
// fallback during hydration — the real check runs in a mount effect.
function hasWebGL(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// Curated places render UNCLUSTERED — every place is its own pin, shown all
// at once (owner call 2026-07-21: clustering into numbered bubbles hid real
// places and read as a bad experience). The dominant-family cluster tint that
// used to color the count discs is gone with them.

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
  type BrowseDockInfo,
  type CemeteryPin,
  type CivicPin,
  type EventPin,
  type MapLineFC,
  type MapPinPlace,
  type MarcStationPin,
  type Selected,
  type TransitStopPin,
} from "./types";
import {
  AMENITY_GROUPS,
  AMENITY_KIND_TO_CAT,
  CAM_EASE,
  DUPE_K,
  EMPTY_FC,
  FREDERICK,
  FREDERICK_COUNTY_BOUNDS,
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
import LiveMarcTrains from "./LiveMarcTrains";
import WeatherRadar from "./WeatherRadar";
import LiveIncidents from "./LiveIncidents";
import TrafficCameras from "./TrafficCameras";
import FireStations from "./FireStations";
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
import MapDock from "./MapDock";
import MapPeek from "./MapPeek";
import MapParkingPeek from "./MapParkingPeek";
import { parkingTone, PARKING_TONE_STYLE, type ParkingPin } from "@/lib/map/parking";
import MapList from "./MapList";
import TimeScrubber from "./TimeScrubber";
import { ArrowRight, ChevronRight, LoaderCircle, LocateFixed, Shrink } from "lucide-react";
import { easternHourFloat, withinScrubWindow } from "@/lib/map/scrubTime";
import { easternDayKey } from "@/lib/tz";
import { getOpenStatus, isOpenNow } from "@/lib/hours";

/** An instant whose Frederick wall-clock hour equals `scrubHour` — we shift
 *  from "now" by the delta so getOpenStatus (which reads Frederick time)
 *  evaluates hours at the scrubbed hour without constructing a zoned date. */
function scrubInstant(scrubHour: number): Date {
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const curH = local.getHours() + local.getMinutes() / 60;
  return new Date(Date.now() + (scrubHour - curH) * 3_600_000);
}

/** True when the viewer asked for reduced motion. The CSS `*` gate can't
 *  reach Mapbox's JS-driven camera, so camera moves check this and pass
 *  duration:0 (instant, no glide). */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

/** Keep the county outline clear of the top instrument and mobile nav. On a
 * manual refit we measure the real dock; first paint uses the same responsive
 * fallback before those nodes exist. */
function countyFitPadding(measureDock = true): { top: number; right: number; bottom: number; left: number } {
  if (typeof window === "undefined") {
    return { top: 96, right: 32, bottom: 64, left: 32 };
  }
  const mobile = window.innerWidth < 768;
  const short = window.innerHeight < 600;
  const shortLandscape = window.innerHeight < 520 && window.innerWidth > window.innerHeight;
  const mapTop = measureDock
    ? document.querySelector<HTMLElement>(".mapboxgl-map")?.getBoundingClientRect().top ?? 0
    : 0;
  const dockBottom = measureDock
    ? document.querySelector<HTMLElement>("[data-map-dock]")?.getBoundingClientRect().bottom
    : undefined;
  const measuredTop = dockBottom ? Math.ceil(dockBottom - mapTop + 16) : 0;
  // The first-paint dock is roughly 138–148px tall. Its nodes do not exist yet,
  // so reserve the full instrument plus breathing room on every viewport.
  const fallbackTop = shortLandscape ? 72 : 164;
  return {
    top: Math.max(fallbackTop, measuredTop),
    right: shortLandscape ? 20 : mobile ? 20 : 40,
    bottom: shortLandscape ? 16 : mobile ? (short ? 72 : 104) : 56,
    left: shortLandscape ? 20 : mobile ? 20 : 40,
  };
}

const SHORT_LANDSCAPE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-179, -80],
  [179, 80],
];

type Props = {
  /** Pin-field records (MapPinPlace). Full PlaceCardData satisfies the type,
   *  so SavedList/radius callers pass full records; /map browse passes the
   *  slim set and the sheet hydrates the full card on tap (openPlaceSheet). */
  places: MapPinPlace[];
  osmPlaces?: OsmPlace[];
  height?: string;
  /** Full-bleed layout: drop the rounded border, fill the parent. The
   *  /map route uses this so the map IS the page, not a card on it. */
  fullBleed?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Fit this extent on first paint. Used by the clean /map entry so the
   *  entire county is visible on every viewport, including narrow phones. */
  initialBounds?: [[number, number], [number, number]];
  /** Camera constraints can be looser on the full browse surface than on
   * embedded maps, while coordinate validation remains county-tight. */
  cameraMinZoom?: number;
  cameraMaxBounds?: [[number, number], [number, number]];
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
  /** Open the Trails line layer ON at first paint (no saved pref yet) —
   *  set by the /trails surface, whose whole job is the trail network.
   *  Everywhere else it stays off so the base map is unchanged. */
  trailsLayerDefault?: boolean;
  transitLines?: MapLineFC;
  /** County GIS municipal boundary polygons, rendered as a quiet
   *  always-on outline. Server-fetched (fcGis.getMunicipalBoundaries),
   *  empty FC when the county server is unreachable. */
  municipalBoundaries?: MapLineFC;
  /** County boundary polygon — the quiet always-on county edge (6.1),
   *  drawn under the place pins. Empty FC when unavailable. */
  countyBoundary?: MapLineFC;
  /** Historic cemeteries (county GIS heritage points). Opt-in via the
   *  Layers panel, OFF by default — a niche heritage layer, never part
   *  of the clean cold open. Empty when the county feed is unreachable
   *  (the toggle simply doesn't render). */
  cemeteries?: CemeteryPin[];
  /** Downtown parking garages (static metadata + live availability). The
   *  opt-in Parking layer, OFF by default — five garage markers tinted by
   *  live occupancy, honest about missing counts. Empty when there's no
   *  garage data (embeds). */
  parking?: ParkingPin[];
  /** Upcoming events as map pins — phase 1 differentiator vs Google /
   *  Apple Maps (they don't have local event ↔ venue joins). Already
   *  geo-deduped and scoped to "happening soon" server-side. */
  events?: EventPin[];
  /** Bus-stop dots + MARC stations for the Transit layer (phase 3).
   *  Stops are location+name only (no schedule data exists for them);
   *  MARC pins carry server-computed next trains as clock times. */
  transitStops?: TransitStopPin[];
  marcStations?: MarcStationPin[];
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
  /** Browse-view state + counts for the map dock (/map browse only).
   *  When present the dock renders and the legacy floating controls
   *  (scrubber, aerial season chips, locate homes) stand down. */
  dock?: BrowseDockInfo;
  /** The slugs of places that MATCH the active What/Open-now filter, when
   *  one is on. Non-matching pins are faded (not removed), so the map
   *  visibly reacts to the dock. Null/undefined = nothing filtered =
   *  nothing faded. Provided by BrowseMapClient (which also passes the
   *  FULL place set as `places` in that case). */
  activeSlugs?: string[] | null;
};

export default function AppMap({
  places,
  osmPlaces: osmFromProps,
  height = "78vh",
  fullBleed = false,
  initialCenter = FREDERICK,
  initialZoom = 14,
  initialBounds,
  cameraMinZoom = FREDERICK_MIN_ZOOM,
  cameraMaxBounds = FREDERICK_MAX_BOUNDS,
  recenterToKnownLocation = false,
  pinpointDefault = false,
  onPlacesInView,
  focus,
  civic = [],
  extraAmenities = [],
  amenities = [],
  trailLines = EMPTY_LINE_FC,
  trailsLayerDefault = false,
  transitLines = EMPTY_LINE_FC,
  municipalBoundaries = EMPTY_LINE_FC,
  countyBoundary = EMPTY_LINE_FC,
  cemeteries = [],
  parking = [],
  transitStops = [],
  marcStations = [],
  events = [],
  initialAmenityGroups,
  dock,
  activeSlugs = null,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  // Rotation may refit an untouched county overview, but it must never yank a
  // camera the user deliberately panned, zoomed, searched, or focused.
  const cameraIntentRef = useRef(false);
  // Effective camera home: when we arrived via a category and already
  // hold the user's cached fix, open on them so the map (and its
  // closest-first list) reads "from where you're standing." Read once
  // at mount — never prompts; falls back to the city center. We seed
  // initialViewState directly rather than flyTo so there's no jarring
  // glide from Downtown to the user on load.
  const cachedPosition = useMemo<LngLat | null>(() => {
    if (!recenterToKnownLocation) return null;
    const cached = readCachedPosition();
    return cached && isInFrederickCounty(cached.lng, cached.lat) ? cached : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot read of the cached fix at mount
  }, []);
  const effectiveCenter: [number, number] = cachedPosition
    ? [cachedPosition.lng, cachedPosition.lat]
    : initialCenter;
  // Stable first-paint camera input. Measuring DOM here on every React render
  // caused avoidable layout reads; explicit Whole County refits still measure
  // the live dock through countyFitPadding().
  const initialCountyPadding = useMemo(() => countyFitPadding(false), []);
  const [shortLandscapeViewport, setShortLandscapeViewport] = useState(
    () => typeof window !== "undefined" && window.innerHeight < 520 && window.innerWidth > window.innerHeight,
  );
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
  useEffect(() => {
    const updateViewportMode = () => {
      const next = window.innerHeight < 520 && window.innerWidth > window.innerHeight;
      setShortLandscapeViewport((current) => current === next ? current : next);
    };
    window.addEventListener("resize", updateViewportMode, { passive: true });
    window.addEventListener("orientationchange", updateViewportMode, { passive: true });
    return () => {
      window.removeEventListener("resize", updateViewportMode);
      window.removeEventListener("orientationchange", updateViewportMode);
    };
  }, []);
  const previousShortLandscape = useRef(shortLandscapeViewport);
  useEffect(() => {
    const wasShortLandscape = previousShortLandscape.current;
    previousShortLandscape.current = shortLandscapeViewport;
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Keep the Mapbox imperative state in step with the reactive prop during
    // an orientation transition, then resize before calculating the fit.
    map.setMaxBounds(shortLandscapeViewport ? SHORT_LANDSCAPE_MAX_BOUNDS : cameraMaxBounds);
    map.resize();

    const viewportModeChanged = shortLandscapeViewport !== wasShortLandscape;
    const untouchedCountyView = Boolean(initialBounds) && !recenterToKnownLocation && !urlCamera;
    if (!viewportModeChanged || !untouchedCountyView || cameraIntentRef.current) return;

    requestAnimationFrame(() => {
      map.resize();
      map.fitBounds(FREDERICK_COUNTY_BOUNDS, {
        padding: countyFitPadding(),
        duration: prefersReducedMotion() ? 0 : 450,
        easing: CAM_EASE,
        essential: true,
      });
    });
  }, [cameraMaxBounds, initialBounds, recenterToKnownLocation, shortLandscapeViewport, urlCamera]);
  const { openSheet } = usePlaceSheet();
  // ── Sheet hydration (the /map payload slim). Browse mode ships pin-field
  // records only; the sheet is the one consumer that wants the full card
  // (photos, rating, hours, address). Open INSTANTLY with the pin fields —
  // PlaceSheet optional-chains everything beyond them — then swap in the full
  // record from /api/places/by-slugs (CDN-cached 1h) when it lands, usually
  // within a frame or two. Cache per slug so re-taps are instant + offline-
  // tolerant. Callers holding full records (SavedList, radius mode) just get
  // one redundant background fetch the first time, served from cache.
  const hydratedRef = useRef(new globalThis.Map<string, PlaceCardData>());
  const openPlaceSheet = (pin: MapPinPlace) => {
    const withDist = (x: PlaceCardData): PlaceCardData =>
      userLoc ? { ...x, distance_m: haversineMeters(userLoc, x.geom) } : x;
    const cached = hydratedRef.current.get(pin.slug);
    if (cached) {
      openSheet(withDist(cached));
      return;
    }
    openSheet(withDist(pin as PlaceCardData));
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(pin.slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { places?: PlaceCardData[] } | null) => {
        const full = d?.places?.[0];
        if (full && full.slug === pin.slug) {
          hydratedRef.current.set(pin.slug, full);
          openSheet(withDist(full));
        }
      })
      .catch(() => {
        /* offline / transient — the pin-field sheet stays up, still useful */
      });
  };
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
  // Remembered layer choices (per device). Read ONCE on mount — layers on top
  // of the clean cold open without reversing it: only explicit prior choices
  // restore, a first-timer still gets the clean default, deep-links win below.
  const [layerPrefs] = useState(readMapLayerPrefs);
  // The internal category-chip filter (activeCats) retired with the dock:
  // "places by type" merged into the What pane's intent chips, which filter
  // through the URL (?intent/?sub) like every shareable view. Stored cats
  // prefs are ignored (and cleared on the next write) so no invisible
  // filter can survive without UI to show or clear it.
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>(osmFromProps ?? loadCachedOsm() ?? []);
  const wantsOsmInitially = (initialAmenityGroups ?? layerPrefs.amenities ?? []).length > 0;
  const [osmLoading, setOsmLoading] = useState(wantsOsmInitially && osmPlaces.length === 0);
  // P0-10: a fatal Mapbox failure (missing/invalid token, style auth)
  // must degrade to a stable branded state, never a blank rectangle.
  const [mapError, setMapError] = useState(false);
  // A browser with no WebGL (locked-down corporate profile, a headless/bot
  // client, GPU blocklisted) can never paint the GL canvas — react-map-gl just
  // renders an empty rectangle, which is exactly the "map failed to load" a
  // reviewer hit. Distinguish it from a transient token/network error so the
  // fallback copy is honest: "reload" won't fix an unsupported browser. Checked
  // once on mount (client only); the same branded overlay covers the dead canvas.
  const [mapUnsupported, setMapUnsupported] = useState(false);
  useEffect(() => {
    if (!hasWebGL()) {
      setMapUnsupported(true);
      setMapError(true);
    }
  }, []);
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
  // Whether a dock pane is open — mirrored onto the host container so
  // CSS can hide the zoom corner furniture while the dock is expanded.
  const [dockPaneOpen, setDockPaneOpen] = useState(false);
  // While the map is actively panning/zooming, the floating filter dock fades
  // back so it's not in the way of the map you're reading; it returns the
  // moment the map settles. Never fades while a pane is open (you're mid-edit).
  const [mapMoving, setMapMoving] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventPin | null>(null);
  // DOM pins outside the camera must not remain in the keyboard sequence.
  // This set refreshes after every settled move and on the initial load.
  const [eventSlugsInView, setEventSlugsInView] = useState<Set<string>>(
    () => new Set(),
  );
  // Time scrubber (living map): null = live/off; otherwise a 0-24 Frederick
  // hour the map re-evaluates against. Pure client state — no refetch, no
  // server mode change.
  const [scrubHour, setScrubHour] = useState<number | null>(null);
  // Cluster index drawer: tapping a curated cluster used to ONLY zoom-step —
  // a dense downtown "47" bubble took 2-3 taps to resolve and there was no
  // way to see what it contained (the synced list was deliberately removed:
  // the map IS the page). A transient drawer respects that call: one tap
  // lists the cluster's places (name, category dot, open state); a row focuses
  // its pin + opens the sheet, then the drawer dismisses. Null = closed.
  const [clusterList, setClusterList] = useState<
    { slug: string; name: string; category: string; closing: boolean }[] | null
  >(null);
  // (Mark-a-spot left the map entirely, owner call 2026-07-02: the in-map
  // mark mode built earlier the same day still read as overlay clutter on
  // the map surface. Marking lives at /report — reachable from More →
  // "Mark a spot" — and submitted reports still render via the community
  // reports layer.)
  const [q, setQ] = useState("");
  // Pin peek — the compact bottom card that rises when a curated pin is
  // tapped (photo, open state, distance, Save + Directions). Upgrades the
  // cramped popup into a real card you can act on without leaving the map.
  const [peekPlace, setPeekPlace] = useState<MapPinPlace | null>(null);
  // Map ↔ list toggle: flip the currently-filtered pins into a scannable
  // list. ?view=list preserves the choice without dropping any existing
  // filter, layer, scope, or camera parameter.
  const [listView, setListView] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "list") {
      setListView(true);
    }
  }, []);
  // True once the camera has moved off the county overview (the county opens at
  // ~z9.6; past ~z10.6 the user has zoomed or panned in). Drives the "show the
  // whole county" reset FAB so it only appears when there is somewhere to go
  // back from, and hides again once fitCounty() returns to the overview.
  const [offOverview, setOffOverview] = useState(false);
  const updateListView = (next: boolean) => {
    setListView(next);
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("view", "list");
      else url.searchParams.delete("view");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // URL persistence is an enhancement; the local toggle still works.
    }
  };
  const [userLoc, setUserLoc] = useState<LngLat | null>(cachedPosition);
  const [locating, setLocating] = useState(false);
  const [showCivic, setShowCivic] = useState(() => layerPrefs.civic ?? false);
  const [showTrails, setShowTrails] = useState(() => layerPrefs.trails ?? trailsLayerDefault);
  const [showTransit, setShowTransit] = useState(
    () => layerPrefs.transit ?? initialDefaults.lineLayers.includes("transit"),
  );
  // Aerial photo overlay — the Frederick Radius moat. Off by default
  // since 104 pins is a lot to render until the user opts in. Tapping
  // one opens a Popup with the photo thumbnail + season + date.
  const [showAerial, setShowAerial] = useState(() => layerPrefs.aerial ?? false);
  const [selectedAerial, setSelectedAerial] = useState<AerialPhoto | null>(null);
  // Historic cemeteries — opt-in heritage overlay (county GIS). OFF by
  // default: 250+ pins of local history is a deliberate interest, not
  // part of the clean cold open. Tapping one opens a small popup.
  const [showCemeteries, setShowCemeteries] = useState(() => layerPrefs.cemeteries ?? false);
  const [selectedCemetery, setSelectedCemetery] = useState<CemeteryPin | null>(null);
  // Downtown parking garages — opt-in Parking layer, OFF by default (five
  // garage markers tinted by live availability). Tapping one raises the
  // parking peek; live numbers hydrate from the server-fetched snapshot when
  // the feed is configured, otherwise the markers stay neutral (no fake count).
  const [showParking, setShowParking] = useState(() => layerPrefs.parking ?? false);
  const [parkingPeek, setParkingPeek] = useState<ParkingPin | null>(null);
  // Animated weather radar (RainViewer) — opt-in raster drape under the
  // pins. OFF by default; the tray's toggle stamps the newest frame's time
  // so nobody mistakes minutes-old radar for real time.
  const [showRadar, setShowRadar] = useState(() => layerPrefs.radar ?? false);
  // Newest radar frame's unix seconds — the honesty stamp in the tray.
  const [radarFrameEpoch, setRadarFrameEpoch] = useState<number | null>(null);
  // Live public scanner incidents (crashes, wires down, fires) — opt-in,
  // OFF by default. Empty until the FredScanner feed is configured.
  const [showIncidents, setShowIncidents] = useState(() => layerPrefs.incidents ?? false);
  // MDOT CHART traffic cameras (I-70, US-15, US-340…) — opt-in, OFF by default.
  const [showCameras, setShowCameras] = useState(() => layerPrefs.cameras ?? false);
  // Frederick County fire & rescue companies (GIS, static) — opt-in, OFF by
  // default. Each pin is the station number, the root of its call signs.
  const [showFireStations, setShowFireStations] = useState(() => layerPrefs.firestations ?? false);
  // MARC station popup (Transit layer, phase 3). Holds the station name;
  // departures are looked up from the marcStations prop at render.
  const [marcPeek, setMarcPeek] = useState<string | null>(null);
  // Current viewport bounds (set on every settled move) — makes the dock's
  // count line honest to what the EYES see, not the whole county
  // (viewport-honest count, 2026-07-17 map audit). Null until first settle
  // (initial render counts everything, which at county zoom is the truth).
  const [viewBounds, setViewBounds] = useState<{ w: number; e: number; s: number; n: number } | null>(null);
  // Time machine: which season's drone shots are lit. "all" shows every
  // pin; a season fades the others out (cross-fade, not a hard cut).
  const [aerialSeason, setAerialSeason] = useState<AerialSeason>("all");
  // Mapbox paint transitions ignore the prefers-reduced-motion media
  // query, so gate the cross-fade duration ourselves to honor it.
  const aerialFade = (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) ? 0 : 450;
  // Tap-a-town: the municipality under the last empty-map tap (name +
  // tap point for the popup anchor). Null when no town sheet is open.
  const [civicTown, setCivicTown] = useState<{ name: string; lng: number; lat: number } | null>(null);

  // 3D relief while browsing the drone archive. The aerial layer is the
  // one mode where the county's terrain IS the content, so toggling it
  // on drapes the map over the DEM the hillshade already loads (fr-dem,
  // no extra tile pyramid) and eases to a gentle pitch; toggling off
  // flattens back to the field-guide plan view. Reduced motion snaps
  // instead of easing. Fail-soft: if the style hasn't installed fr-dem
  // yet (or WebGL is struggling), the map just stays flat.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => {
      try {
        if (showAerial && map.getSource("fr-dem")) {
          map.setTerrain({ source: "fr-dem", exaggeration: 1.35 });
          map.easeTo({ pitch: 52, duration: aerialFade === 0 ? 0 : 900 });
        } else {
          map.setTerrain(null);
          if (map.getPitch() > 0) map.easeTo({ pitch: 0, duration: aerialFade === 0 ? 0 : 600 });
        }
      } catch {
        /* terrain is a garnish; never let it break the map */
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [showAerial, aerialFade]);

  // Remember the user's explicit layer choices (per device) so a customized map
  // survives reload. Transient focus filters (saved-only / field-notes-only)
  // are intentionally excluded — see mapLayerPrefs.
  useEffect(() => {
    writeMapLayerPrefs({
      // cats retired with the dock (see above) — writing an empty list
      // clears any previously stored set.
      cats: [],
      amenities: [...amenityGroups],
      civic: showCivic,
      transit: showTransit,
      trails: showTrails,
      aerial: showAerial,
      cemeteries: showCemeteries,
      parking: showParking,
      radar: showRadar,
      incidents: showIncidents,
      cameras: showCameras,
      firestations: showFireStations,
    });
  }, [amenityGroups, showCivic, showTransit, showTrails, showAerial, showCemeteries, showParking, showRadar, showIncidents, showCameras, showFireStations]);

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
    // Overpass is an optional enrichment source. The curated county map is
    // complete on cold open, so do not download the county-wide dataset until
    // the user activates an amenity group (or arrives via an amenity link).
    if (amenityGroups.size === 0) {
      setOsmLoading(false);
      setOsmError(null);
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
  }, [osmFromProps, amenityGroups.size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tap a result in the synced list → fly there, glow it, light haptic.
  useEffect(() => {
    if (!focus) return;
    const p = places.find((x) => x.slug === focus.slug);
    const map = mapRef.current?.getMap();
    if (!p || !map) return;
    setSelectedSlug(p.slug);
    haptic("light");
    cameraIntentRef.current = true;
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
    // with the saved lens below. (The category-chip filter retired with the
    // dock — "places by type" is the URL-driven intent filter now, applied
    // upstream in BrowseMapClient before `places` arrives.)
    if (fieldNotesOnly) base = base.filter((p) => p.field_notes);
    if (showSavedOnly) return base.filter((p) => followedSlugs.has(p.slug));
    if (fieldNotesOnly) return base;
    // Pinpoint-first: a clean map until the user picks something (unused by
    // /map browse, which always shows the whole clustered set).
    return pinpointDefault ? [] : base;
  }, [places, pinpointDefault, showSavedOnly, followedSlugs, fieldNotesOnly]);

  // The set of pins that MATCH the active What/Open-now filter. When a
  // filter is on, BrowseMapClient hands us the FULL place set plus these
  // slugs, and we FADE the rest (rather than removing them) so the map
  // visibly reacts to the dock. Null = no filter = everything matches.
  const matchSet = useMemo(
    () => (activeSlugs ? new Set(activeSlugs) : null),
    [activeSlugs],
  );
  // What the dock counts + the list show: the drawn pins (lens-filtered)
  // intersected with the active match set. The faded pins stay on the map
  // but don't count as "on the map".
  const visiblePlaces = useMemo(
    () => (matchSet ? filteredPlaces.filter((p) => matchSet.has(p.slug)) : filteredPlaces),
    [filteredPlaces, matchSet],
  );

  // Viewport-scoped counts for the dock's count line. O(n) point-in-box
  // per settled move over ≤1.7k pins — negligible next to the GeoJSON
  // rebuild the same states already trigger.
  const inViewPlaces = useMemo(() => {
    if (!viewBounds) return visiblePlaces;
    return visiblePlaces.filter(
      (p) =>
        p.geom &&
        p.geom.lng >= viewBounds.w &&
        p.geom.lng <= viewBounds.e &&
        p.geom.lat >= viewBounds.s &&
        p.geom.lat <= viewBounds.n,
    );
  }, [visiblePlaces, viewBounds]);

  // How many places carry Field Notes — drives the lens chip's count.
  const fieldNotesCount = useMemo(() => places.filter((p) => p.field_notes).length, [places]);

  // Emit the curated places inside the current viewport (nearest-center
  // first) whenever the map settles — drives the synced results list.
  const emitInView = () => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    const b = map.getBounds();
    if (!b) return;
    setViewBounds({ w: b.getWest(), e: b.getEast(), s: b.getSouth(), n: b.getNorth() });
    setEventSlugsInView(
      new Set(
        events
          .filter(
            (event) =>
              event.lng >= b.getWest() &&
              event.lng <= b.getEast() &&
              event.lat >= b.getSouth() &&
              event.lat <= b.getNorth(),
          )
          .map((event) => event.slug),
      ),
    );
    if (!onPlacesInView) return;
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
    return {
      type: "FeatureCollection" as const,
      features: pool.map((p) => ({
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
  }, [osmPlaces, osmDupesCurated]);

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
    // The deterministic amenity snapshot and the live Overpass response can
    // contain the exact same OSM object. Prefer the snapshot so a refreshed
    // water/trash/bench point never renders twice when Overpass is healthy.
    const curatedOsmIds = new Set(
      amenities.flatMap((amenity) => {
        const match = amenity.id.match(/-(n|w|r)-(\d+)$/);
        if (!match) return [];
        const type = match[1] === "n" ? "node" : match[1] === "w" ? "way" : "relation";
        return [`${type}/${match[2]}`];
      }),
    );
    // Merge server-fetched Mapillary trash detections in with OSM
    // amenities — same OsmPlace shape, category_slug "trash", so they
    // ride the existing "Trash" toggle with no special-casing.
    const feats = [...osmPlaces, ...extraAmenities]
      .filter(
        (p) =>
          isAmenity(p) &&
          activeAmenityCats.has(p.category_slug) &&
          !isKnownClosed(p.name) &&
          !curatedOsmIds.has(p.osm_id)
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
        // Category color as a literal hex on the feature (GL paint can't
        // read var(--app-*)). Mirrors colorOf() in categoryMarkers.ts —
        // leaf color, else the parent category's color, else brand — so the
        // wide-zoom dot matches the puck it cross-fades into.
        color:
          CATEGORY_BY_SLUG[p.category]?.color
          ?? CATEGORY_BY_SLUG[CATEGORY_BY_SLUG[p.category]?.parent ?? ""]?.color
          ?? "#E14328",
        bucket: bucketOf(p.category),
        // "Last call" — open now but closing within the hour. Drives a
        // soft amber halo so a glance catches what's about to close.
        closing: p.open_status?.state === "closing-soon",
        // Draw order within the curated tier: verified places first so
        // the strongest pins win the spot when icons stack.
        pri: p.is_verified ? 0 : 1,
        // Faded when an active What/Open-now filter doesn't match this pin
        // (interaction: the map reacts to the dock, not just the count).
        dimmed: matchSet ? !matchSet.has(p.slug) : false,
        // Emphasized: a MATCH while a filter is active. Drives the icon-size
        // boost so matches grow and dominate over the shrunk, faded rest —
        // weak contrast (matches at full, rest at 0.28) read as barely
        // filtered before. false on the clean, unfiltered map.
        emph: matchSet ? matchSet.has(p.slug) : false,
      },
      geometry: { type: "Point" as const, coordinates: [p.geom.lng, p.geom.lat] },
    })),
  }), [filteredPlaces, matchSet]);

  // ── Living-map scrub → place open/closed via feature-state ──────────────
  // Snappy by design: rather than re-serializing the GeoJSON source, flip a
  // per-pin `dim` feature-state and let the icon-opacity expression paint it
  // on the GPU. The compact client hours bundle is lazy-loaded on first scrub
  // (the deliberately-slimmed browse payload carries no hours), then reused.
  // Reapplied whenever the source data changes (Mapbox clears feature-state on
  // setData) or the hour moves; cleared when the scrubber turns off.
  const clientHoursRef = useRef<globalThis.Map<string, { hours: PlaceCardData["hours"]; verified: boolean }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function apply() {
      const m = mapRef.current?.getMap();
      if (!m || !m.getSource("curated-places")) return;
      if (scrubHour == null) {
        m.removeFeatureState({ source: "curated-places" });
        return;
      }
      if (!clientHoursRef.current) {
        const mod = await import("@/lib/loaders/places-client");
        if (cancelled) return;
        clientHoursRef.current = new globalThis.Map(
          mod.clientPlaces().map((p) => [p.slug, { hours: p.hours, verified: p.hours_verified ?? false }] as const),
        );
      }
      const hoursBySlug = clientHoursRef.current;
      if (!hoursBySlug) return;
      const at = scrubInstant(scrubHour);
      for (const p of filteredPlaces) {
        const h = hoursBySlug.get(p.slug);
        const open = h?.hours ? isOpenNow(getOpenStatus(h.hours, { verified: h.verified }, at)) : true;
        m.setFeatureState({ source: "curated-places", id: p.slug }, { dim: !open });
      }
    }
    const m = mapRef.current?.getMap();
    if (m && m.isSourceLoaded("curated-places")) apply();
    else if (m) m.once("idle", apply);
    return () => { cancelled = true; };
  }, [scrubHour, curatedGeoJson, filteredPlaces]);

  // Cluster fade to match the pin fade: a cluster disc mixes matched +
  // unmatched pins, so it can't be dimmed per-feature — instead the whole
  // cluster tier softens uniformly while a What/Open-now filter is active,
  // then returns to full when it clears (mirrors the mockup's `.cl{opacity:.3}`).
  // A garnish: wrapped so a paint hiccup never breaks the map.
  useEffect(() => {
    const m = mapRef.current?.getMap();
    if (!m) return;
    const apply = () => {
      try {
        if (!m.getLayer("curated-clusters")) return;
        const on = matchSet != null;
        m.setPaintProperty("curated-clusters", "circle-opacity", on ? 0.3 : 0.62);
        if (m.getLayer("curated-cluster-glow"))
          m.setPaintProperty("curated-cluster-glow", "circle-opacity", on ? 0.09 : 0.18);
        if (m.getLayer("curated-cluster-counts"))
          m.setPaintProperty("curated-cluster-counts", "text-opacity", on ? 0.55 : 1);
      } catch {
        /* paint is a garnish; never let it break the map */
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [matchSet]);

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
      // An empty tap is a DISMISS first. If a pin peek, a parking peek, or a
      // selected pin is open, closing it IS the whole gesture — no town bubble,
      // no haptic. (The map used to grab every empty tap and pop an unrequested
      // "which town?" sheet, so you could never simply tap away to clear a card.)
      if (peekPlace || parkingPeek || selectedSlug) {
        setPeekPlace(null);
        setParkingPeek(null);
        setSelectedSlug(null);
        return;
      }
      // Nothing was open, so this is a deliberate tap on empty land -> which
      // town am I in? Point-in-polygon against the municipal boundaries already
      // drawn, then open a compact civic sheet.
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
    if (layer === "marc-station-pins") {
      setMarcPeek(String(feature.properties?.name ?? ""));
      haptic("light");
      return;
    }
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
            cameraIntentRef.current = true;
            smoothFocus(map, coords, { minZoom: zoom, maxStep: 2.5 });
          });
        // Curated clusters ALSO answer "what's in here": list the leaves in a
        // transient drawer (nearest-first is the source order). Capped at 60
        // so a county-wide mega-cluster stays scannable; the zoom glide above
        // still runs, so dismissing the drawer leaves the user closer in.
        if (layer === "curated-clusters" && "getClusterLeaves" in source) {
          (source as unknown as { getClusterLeaves: (id: number, limit: number, offset: number, cb: (err: Error | null, feats: GeoJSON.Feature[]) => void) => void })
            .getClusterLeaves(clusterId, 60, 0, (err, feats) => {
              if (err || !feats?.length) return;
              setClusterList(
                feats.map((f) => {
                  const pr = (f.properties ?? {}) as Record<string, unknown>;
                  return {
                    slug: String(pr.slug ?? ""),
                    name: String(pr.name ?? ""),
                    category: String(pr.category ?? ""),
                    closing: Boolean(pr.closing),
                  };
                }).filter((x) => x.slug && x.name),
              );
            });
        }
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
      if (place) {
        // A quick PEEK card rises from the bottom (photo, open state,
        // distance, Save + Directions) so the user can act without leaving
        // the map; "Open page" in the peek hands off to the full sheet.
        setSelected(null);
        setSelectedEvent(null);
        setParkingPeek(null);
        setPeekPlace(place);
        // Lift the tapped pin above the bottom card (Google/Apple pattern):
        // shift the camera up so the pin + its selected glow stay visible
        // instead of hiding under the card that just rose over them.
        const m = mapRef.current?.getMap();
        cameraIntentRef.current = true;
        m?.easeTo({
          center: [place.geom.lng, place.geom.lat],
          offset: [0, -120],
          duration: prefersReducedMotion() ? 0 : 500,
          essential: true,
        });
      }
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

    if (layer === "cemetery-icons") {
      const id = String(feature.properties?.id ?? "");
      const cem = cemeteries.find((c) => c.id === id);
      if (cem) {
        haptic("light");
        setSelectedCemetery(cem);
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

  // OSM amenities are flaky (live Overpass; empty in the sandbox). The
  // curated amenities.json is always present, so the Amenities tray is
  // gated on EITHER source having points — that is the fix for "I
  // don't see the water fountains / things we just added".
  const amenityCount = osmPlaces.filter(isAmenity).length + amenities.length;

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
        .then((r) => (r.ok ? r.json() : { results: [] }))
        // /api/search returns { results: [...] } (same shape SearchOverlay
        // reads). Unwrap it — reading the response as a bare array left the
        // map dock's search silently empty on every keystroke.
        .then((d: { results?: SearchResult[] }) => setSearchMatches(Array.isArray(d?.results) ? d.results : []))
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
    const m = new globalThis.Map<string, MapPinPlace>();
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
        if (map) {
          cameraIntentRef.current = true;
          smoothFocus(map, [p.geom.lng, p.geom.lat], { minZoom: 15 });
        }
        setParkingPeek(null);
        setPeekPlace(p);
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
  // Real walking minutes for the SELECTED place only (Mapbox Directions
  // via /api/walk-time — never fetched per pin). The chip renders the
  // straight-line estimate immediately and swaps the routed figure in
  // place when it lands: same slot, no spinner, no layout shift. The
  // tilde is the honesty marker — "~4 min walk" is the estimate, "5 min
  // walk" is the routed truth. Gated on a real geolocation fix plus
  // walkable range (shouldFetchWalkTime); reselecting aborts the
  // in-flight fetch, and the slug key drops any stale late response.
  const [realWalk, setRealWalk] = useState<{ slug: string; minutes: number } | null>(null);
  useEffect(() => {
    setRealWalk(null);
    if (!userLoc || !selectedPlace) return;
    if (!shouldFetchWalkTime(haversineMeters(userLoc, selectedPlace.geom))) return;
    const slug = selectedPlace.slug;
    const ctrl = new AbortController();
    fetch(`/api/walk-time?${walkTimeQuery(userLoc, selectedPlace.geom)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ok?: boolean; minutes?: number } | null) => {
        if (d?.ok && typeof d.minutes === "number" && d.minutes >= 1) {
          setRealWalk({ slug, minutes: Math.round(d.minutes) });
        }
      })
      .catch(() => {
        /* aborted or offline — the straight-line estimate stands */
      });
    return () => ctrl.abort();
  }, [userLoc, selectedPlace]);
  const routeInfo = useMemo(() => {
    if (!userLoc || !selectedPlace) return null;
    const m = haversineMeters(userLoc, selectedPlace.geom);
    // Honest mode for the estimate: downtown the answer is a WALK ("~1 min
    // drive" for a place 300m away read as parody). Under ~800m show walk
    // minutes; beyond that, drive.
    const walkable = m <= WALK_LABEL_MAX_METERS;
    const mins = Math.max(1, Math.round(metersToMinutes(walkable ? "walk" : "drive", m)));
    const routedMin =
      walkable && realWalk && realWalk.slug === selectedPlace.slug ? realWalk.minutes : null;
    return {
      dist: formatDistance(m),
      eta: routedMin != null ? `${routedMin} min walk` : `~${mins} min ${walkable ? "walk" : "drive"}`,
      href: `https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.geom.lat},${selectedPlace.geom.lng}`,
      name: selectedPlace.name,
    };
  }, [userLoc, selectedPlace, realWalk]);

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

  // Historic cemeteries GeoJSON. `name` in properties powers the generic
  // hover preview; the click handler reads the full pin back by `id`.
  const cemeteryGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: cemeteries.map((c) => ({
      type: "Feature" as const,
      properties: { id: c.id, name: c.name },
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
    })),
  }), [cemeteries]);

  const goNearMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const loc = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        cameraIntentRef.current = true;
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
            duration: prefersReducedMotion() ? 0 : 1100,
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
          duration: prefersReducedMotion() ? 0 : 1100,
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

  // Reframe the whole county. Shared by the dock's Where control and the
  // map-surface reset FAB so "get me un-lost" is one tap from either place,
  // not buried three levels into Filters. cameraIntentRef stays false: this is
  // a return to the default frame, not a user pan the leash should preserve.
  const fitCounty = () => {
    cameraIntentRef.current = false;
    mapRef.current?.getMap().fitBounds(FREDERICK_COUNTY_BOUNDS, {
      padding: countyFitPadding(),
      duration: prefersReducedMotion() ? 0 : 900,
      easing: CAM_EASE,
      essential: true,
    });
  };

  // Per-event Frederick hour-of-day + day key, derived once from the events
  // prop (deterministic over fixed timestamps). The scrubber filters same-day
  // events to those live/soon at the chosen hour; other-day events stay put so
  // a weekend event isn't hidden while scrubbing today.
  const eventScrubTimes = useMemo(
    () =>
      events.map((e) => {
        const start = new Date(e.starts_at);
        const localStart = new Date(start.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const startH = easternHourFloat({ hour: localStart.getHours(), minute: localStart.getMinutes() });
        let endH = NaN;
        if (e.ends_at) {
          const localEnd = new Date(new Date(e.ends_at).toLocaleString("en-US", { timeZone: "America/New_York" }));
          endH = easternHourFloat({ hour: localEnd.getHours(), minute: localEnd.getMinutes() });
        }
        return { startH, endH, dayKey: easternDayKey(start) };
      }),
    [events],
  );
  const scrubTodayKey = easternDayKey(new Date());
  const visibleEvents =
    scrubHour == null
      ? events
      : events.filter((_, i) => {
          const t = eventScrubTimes[i];
          if (!t || t.dayKey !== scrubTodayKey) return true;
          return withinScrubWindow(t.startH, t.endH, scrubHour);
        });

  // Multiple events often share one venue. Separate those buttons by at
  // least one tap target so each event remains visible and independently
  // operable instead of stacking into a single ambiguous pin.
  const eventOffsets = useMemo(() => {
    const groups: Record<string, EventPin[]> = {};
    const offsets: Record<string, [number, number]> = {};
    for (const event of visibleEvents) {
      const key = `${event.lng.toFixed(4)}:${event.lat.toFixed(4)}`;
      (groups[key] ??= []).push(event);
    }
    for (const group of Object.values(groups)) {
      if (group.length === 1) {
        offsets[group[0].slug] = [0, 0];
        continue;
      }
      const radius = Math.max(32, group.length * 8);
      group.forEach((event, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / group.length;
        offsets[event.slug] = [
          Math.round(Math.cos(angle) * radius),
          Math.round(Math.sin(angle) * radius),
        ];
      });
    }
    return offsets;
  }, [visibleEvents]);

  // "Closes within the hour" — the dock's living count line. open_status
  // "closing-soon" is exactly the ≤60-minute window (getOpenStatus).
  const closingSoonCount = useMemo(
    () => inViewPlaces.filter((p) => p.open_status?.state === "closing-soon").length,
    [inViewPlaces],
  );

  // Season rows for the dock's Aerial nested strip (label + count per
  // season, from the manifest).
  const aerialSeasonItems = useMemo(
    () =>
      AERIAL_SEASONS.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        count: s.key === "all" ? AERIAL_PHOTOS.length : (AERIAL_SEASON_COUNTS[s.key] ?? 0),
      })),
    [],
  );

  return (
    <div
      className={
        fullBleed
          ? `relative h-full w-full overflow-hidden${dock ? " dock-host" : ""}`
          : "relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      }
      data-dock-pane={dock ? (dockPaneOpen ? "open" : "closed") : undefined}
      style={fullBleed ? undefined : { borderColor: "var(--app-border)", height }}
      onPointerDownCapture={(event) => {
        const target = event.target as Element;
        if (target.closest(".mapboxgl-canvas-container, .mapboxgl-ctrl")) {
          cameraIntentRef.current = true;
        }
      }}
      onWheelCapture={() => { cameraIntentRef.current = true; }}
    >
      {/* ── The search bar. On /map browse it's FOLDED INTO the dock's top
          row (MapDock) so there is one instrument and one map-search; the
          floating bar renders only on dock-less embeds (SavedList's map),
          where it also keeps its locate icon. ── */}
      {!dock && (
        <AppMapDeck
          q={q}
          setQ={setQ}
          searchMatches={searchMatches}
          pickSearch={pickSearch}
          goNearMe={goNearMe}
          locating={locating}
          userLoc={userLoc}
        />
      )}

      {/* Living-map time scrubber. On /map browse it lives INSIDE the
          dock's When pane ("The day"); the floating card remains only
          for dock-less full-bleed maps so nothing regresses there. */}
      {fullBleed && !dock && <TimeScrubber floating hour={scrubHour} onChange={setScrubHour} />}

        {mapError && (
          <div
            className="absolute inset-0 z-[var(--z-map-control)] flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ background: "var(--app-bg)" }}
            role="alert"
          >
            <p className="font-serif text-base font-semibold" style={{ color: "var(--app-ink)" }}>
              {mapUnsupported ? "This browser can't show the map" : "The map is temporarily unavailable"}
            </p>
            <p className="max-w-xs text-xs leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              {mapUnsupported
                ? "The interactive map needs graphics support this browser does not have. You can still browse the Radius place catalog by list."
                : "It should be back shortly. Reload the map or browse the Radius place catalog by list."}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {!mapUnsupported && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  Reload the map
                </button>
              )}
              <Link
                href="/places"
                className="inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
                style={{ background: "var(--app-brand-press)" }}
              >
                Browse all places
              </Link>
            </div>
          </div>
        )}
        {/* A geolocation denial or failure has to be visible where the user
            just tapped locate. On the dock surface it anchors above the locate
            FAB (bottom-right); dock-less embeds keep the centered toast. Before,
            it was gated to the no-dock case only, so on /map browse a denial
            was silent (it lived inside the collapsed Where pane). */}
        {geoMsg && (
          <div
            className={`z-[var(--z-map-control)] flex items-center gap-2 rounded-full border bg-white/95 px-3 py-1.5 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur ${
              dock ? "map-geo-toast" : "absolute bottom-3 left-1/2 -translate-x-1/2"
            }`}
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
            className={`absolute left-3 z-[var(--z-map-control)] inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur ${
              dock ? "top-[168px]" : "top-3"
            }`}
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
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-cool)" }} aria-hidden />
              <span className="truncate">{routeInfo.name}</span>
              <span style={{ color: "var(--app-ink-3)" }}>
                {routeInfo.dist} · {routeInfo.eta}
              </span>
              <span style={{ color: "var(--app-cool)" }}>Directions ↗</span>
            </a>
          </div>
        )}

        {/* Aerial time machine — scrub the drone archive by season. With a
            dock, the seasons nest under the Aerial photos overlay chip in
            the What pane; the floating strip serves dock-less maps only. */}
        {showAerial && !dock && (
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
                  className="tap-44-y inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.96]"
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
            urlCamera ?? (cachedPosition
              ? {
                  longitude: cachedPosition.lng,
                  latitude: cachedPosition.lat,
                  zoom: initialZoom,
                }
              : initialBounds
              ? {
                  bounds: initialBounds,
                  fitBoundsOptions: { padding: initialCountyPadding },
                }
              : {
                  longitude: effectiveCenter[0],
                  latitude: effectiveCenter[1],
                  zoom: initialZoom,
                })
          }
          mapStyle={MAP_BAKED_STYLE ? (BAKED_STYLE as unknown as StyleSpecification) : STYLE_URL}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
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
          // A 235px-high landscape phone needs a wider camera footprint than
          // any useful local pan leash permits. The fit bounds + 6.8 floor keep
          // the county visible there; portrait/desktop retain the browse leash.
          maxBounds={shortLandscapeViewport ? undefined : cameraMaxBounds}
          minZoom={cameraMinZoom}
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
          interactiveLayerIds={["clusters", "osm-icons", "amenity-icons", "curated-icons", "curated-hit", "aerial-icons", "cemetery-icons", "marc-station-pins"]}
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
            // A restored `?c=` camera can open already zoomed in without ever
            // firing moveend, so seed the reset FAB's visibility from the
            // initial frame too.
            setOffOverview(e.target.getZoom() > 10.6);
          }}
          onMoveStart={() => setMapMoving(true)}
          onMoveEnd={(e) => {
            setMapMoving(false);
            markMapIdleOnce();
            emitInView();
            // The reset FAB only earns its place once the user has left the
            // county overview (see offOverview). Settled zoom > 10.6 means they
            // zoomed or panned in and might want one tap back out.
            setOffOverview(e.target.getZoom() > 10.6);
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
            if (/access token|unauthorized|forbidden|\b40[13]\b|failed to (fetch|load)|\bsprite\b.*(?:failed|404|not found)|(?:failed|404).*\bsprite\b/i.test(msg)) {
              setMapError(true);
            }
          }}
          onMouseMove={onHover}
          onMouseLeave={() => setHover(null)}
        >
          {/* Required Mapbox/OSM credits, collapsed to the compact ⓘ badge
              (permitted by Mapbox ToS) so the text never sits on the map. */}
          <AttributionControl compact position="bottom-right" />
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

          {/* Animated weather radar — raster frames slotted BENEATH the
              muni labels via beforeId, so precipitation drapes the basemap
              but never covers a line, pin, or label. */}
          <WeatherRadar show={showRadar} beforeId="muni-label" onNewestFrame={setRadarFrameEpoch} />

          {/* Live public scanner incidents — caution pins (crashes, wires
              down, fires) that self-refresh and age out. Empty until the
              FredScanner feed is configured; polls only while its toggle is on. */}
          <LiveIncidents show={showIncidents} />

          {/* MDOT CHART traffic cameras — pinned where they are; tap to watch
              the live feed. Fetches once when the layer turns on. */}
          <TrafficCameras show={showCameras} />

          {/* Frederick County fire & rescue companies — static GIS pins, each
              its station number. Tap for the company name + call-sign key. */}
          <FireStations show={showFireStations} />

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
          {/* Bus stops + MARC stations (phase 3) — the other half of the
              Transit layer: where you actually catch the thing. Stops are
              zoom-gated dots (names at street zoom); MARC stations always
              draw when the layer is on, and tapping one shows the next
              scheduled trains. */}
          <Source
            id="transit-stops"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: showTransit
                ? transitStops.map((st) => ({
                    type: "Feature" as const,
                    geometry: { type: "Point" as const, coordinates: [st.lng, st.lat] },
                    properties: { name: st.name },
                  }))
                : [],
            }}
          >
            <Layer
              id="transit-stop-dots"
              type="circle"
              minzoom={12.5}
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 12.5, 2, 16, 4.5],
                "circle-color": "#20506A",
                "circle-opacity": 0.85,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#EEE6D4",
              }}
            />
            <Layer
              id="transit-stop-names"
              type="symbol"
              minzoom={15}
              layout={{
                "text-field": ["get", "name"],
                "text-size": 10,
                "text-offset": [0, 1.1],
                "text-anchor": "top",
                "text-optional": true,
              }}
              paint={{ "text-color": "#20506A", "text-halo-color": "#EEE6D4", "text-halo-width": 1 }}
            />
          </Source>
          <Source
            id="marc-stations"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: showTransit
                ? marcStations.map((st) => ({
                    type: "Feature" as const,
                    geometry: { type: "Point" as const, coordinates: [st.lng, st.lat] },
                    properties: { name: st.name },
                  }))
                : [],
            }}
          >
            <Layer
              id="marc-station-pins"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
                "circle-color": "#5A4FCF",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#EEE6D4",
              }}
            />
            <Layer
              id="marc-station-names"
              type="symbol"
              minzoom={10}
              layout={{
                "text-field": ["concat", "MARC · ", ["get", "name"]],
                "text-size": 11,
                "text-offset": [0, 1.2],
                "text-anchor": "top",
                "text-optional": true,
              }}
              paint={{ "text-color": "#3F3894", "text-halo-color": "#EEE6D4", "text-halo-width": 1.2 }}
            />
          </Source>
          {/* Live vehicles and route lines are one honest Transit layer. The
              old always-on vehicles made the dock say "No layers" while buses
              were visibly moving on the map. */}
          <LiveBuses show={showTransit} />
          {/* MARC trains ride the SAME Transit toggle — one honest layer.
              DOM markers sit above the canvas, so a train at Point of Rocks
              never hides beneath its marc-station pin. */}
          <LiveMarcTrains show={showTransit} />
          <Source id="trail-lines" type="geojson" data={(showTrails ? trailLines : EMPTY_LINE_FC) as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="trail-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                // Color by surface so the network reads at a glance: green =
                // paved (bikes, strollers, wheelchairs), ochre = unpaved dirt
                // trail, muted when the county didn't record a surface.
                "line-color": [
                  "match",
                  ["get", "paved"],
                  "paved", "#1E6B3A",
                  "unpaved", "#B4712A",
                  "#6E6552",
                ],
                "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 2.8, 17, 4.5],
                "line-opacity": 0.8,
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
                      Civic details are not available for {title}.
                    </p>
                  )}
                  {muni && (
                    <Link href={`/m/${muni.slug}`} style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--app-brand, #E14328)" }}>
                      {title} guide <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
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
                "circle-color": ACCENTS.slate,
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
            promoteId="slug"
          >
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
            {/* Dot → puck density transition. The map is unclustered: every
                curated place is always shown. At the county/mid view that would
                be ~1,700 overlapping full pucks (a downtown blob), so wide/mid
                zoom draws each place as a small category-colored DOT — a legible
                stipple that still shows everything and still honors the
                filter's emph/dimmed weighting. As you zoom into a few blocks
                the dots fade out (12.5 → 13.5) and the full pucks fade in,
                cross-fading so nothing pops. Under the pucks/labels by JSX order. */}
            <Layer
              id="curated-dots"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              maxzoom={13.5}
              paint={{
                "circle-color": ["get", "color"],
                "circle-radius": [
                  "*",
                  ["interpolate", ["linear"], ["zoom"], 9, 2.2, 11, 3.2, 13, 4.6],
                  [
                    "case",
                    ["==", ["get", "emph"], true], 1.35,
                    ["==", ["get", "dimmed"], true], 0.7,
                    1,
                  ],
                ],
                "circle-stroke-color": "#FAF3E2",
                "circle-stroke-width": 0.8,
                "circle-opacity": [
                  "*",
                  ["interpolate", ["linear"], ["zoom"], 12.5, 1, 13.5, 0],
                  ["case", ["==", ["get", "dimmed"], true], 0.35, 1],
                ],
                "circle-stroke-opacity": [
                  "interpolate", ["linear"], ["zoom"], 12.5, 0.9, 13.5, 0,
                ],
              }}
            />
            <Layer
              id="curated-icons"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              minzoom={12.5}
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
                //
                // A filter-contrast multiplier rides ON TOP of the zoom
                // curve (the stops themselves are unchanged): a match
                // grows to 1.22×, a non-match shrinks to 0.72×, and a
                // pin on the clean/unfiltered map stays at 1×. Paired
                // with the icon-opacity fade below, matches dominate.
                "icon-size": [
                  "*",
                  [
                    "interpolate", ["linear"], ["zoom"],
                    9, 0.26,
                    11, 0.36,
                    13, 0.5,
                    15, 0.72,
                    17, 0.88,
                    19, 0.95,
                  ],
                  [
                    "case",
                    ["==", ["get", "emph"], true], 1.22,
                    ["==", ["get", "dimmed"], true], 0.72,
                    1,
                  ],
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
              paint={{
                // Two ways a pin fades, ORed together:
                //  - feature-state `dim`: closed at the scrubbed hour (set
                //    client-side by the scrub effect), and
                //  - the `dimmed` property: doesn't match the active What /
                //    Open-now filter, so it fades instead of vanishing.
                // No state + no filter = full opacity, so this stays inert
                // on the clean map. Dropped 0.28 → 0.15 so the shrunk
                // non-matches recede hard and the grown matches carry the eye.
                //
                // A zoom ramp (12.5 → 13.2) rides on top so pucks fade IN over
                // the same handoff where the dots fade out — the two never both
                // read at full, so the density transition cross-fades cleanly.
                "icon-opacity": [
                  "*",
                  ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.2, 1],
                  [
                    "case",
                    [
                      "any",
                      ["boolean", ["feature-state", "dim"], false],
                      ["==", ["get", "dimmed"], true],
                    ],
                    0.15,
                    1,
                  ],
                ],
              }}
            />
            {/* Invisible tap-target pad — expands each curated pin's
                hit area to a Fitts-friendly ~44px regardless of how
                tiny the rendered icon gets at street zoom. The single-
                place pins shrink under the iOS 44pt floor; this layer
                keeps the touchable region usable (radius 22 = 44px, the
                iOS minimum) without making the visual pins themselves
                bigger. Same source as curated-icons so the click handler
                can resolve back to the same slug via props.slug. */}
            <Layer
              id="curated-hit"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": "#000000",
                "circle-opacity": 0,
                "circle-radius": 22,
              }}
            />
            {/* Names reveal progressively — the ONE curated label layer (the
                old duplicate curated-names was removed; the two double-drew
                names between 15.5 and 16.5). From z13 up, only standout pins
                label: text-optional + collision (allow/ignore-placement false)
                let the engine draw the highest-priority names first and drop
                the rest, so mid zoom shows a few verified names and more appear
                as you zoom. symbol-sort-key uses pri (verified = 0 = drawn
                first = wins the spot), matching curated-icons. */}
            <Layer
              id="curated-labels"
              type="symbol"
              minzoom={13}
              filter={["!", ["has", "point_count"]]}
              layout={{
                "text-field": ["get", "name"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9.5, 16, 12],
                "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
                "text-anchor": "top",
                "text-offset": [0, 1.15],
                "text-optional": true,
                "text-allow-overlap": false,
                "text-ignore-placement": false,
                "text-max-width": 9,
                "symbol-sort-key": ["get", "pri"],
              }}
              paint={{
                "text-color": "#3A362B",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.1,
                "text-opacity": [
                  "interpolate", ["linear"], ["zoom"],
                  13, 0.85,
                  15, 1,
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
              beforeId="curated-lastcall"
              paint={{ "fill-color": "#E14328", "fill-opacity": 0.07 }}
            />
            <Layer
              id="ring-line"
              type="line"
              beforeId="curated-lastcall"
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
              beforeId="curated-lastcall"
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
                "circle-color": ["match", ["get", "kind"], "traffic", ACCENTS.amber, ACCENTS.slate],
                "circle-opacity": 0.22,
              }}
            />
            <Layer
              id="civic-core"
              type="circle"
              paint={{
                "circle-radius": 5,
                "circle-color": ["match", ["get", "kind"], "traffic", ACCENTS.amber, ACCENTS.slate],
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
                  "spring", SEASON_HEX.spring,
                  "summer", SEASON_HEX.summer,
                  "fall", SEASON_HEX.fall,
                  "winter", SEASON_HEX.winter,
                  SEASON_HEX.fall,
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
                  "spring", SEASON_HEX.spring,
                  "summer", SEASON_HEX.summer,
                  "fall", SEASON_HEX.fall,
                  "winter", SEASON_HEX.winter,
                  SEASON_HEX.fall,
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
                        spring: SEASON_HEX.spring,
                        summer: SEASON_HEX.summer,
                        fall: SEASON_HEX.fall,
                        winter: SEASON_HEX.winter,
                      }[selectedAerial.season]) ?? SEASON_HEX.fall,
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

          {/* Historic cemeteries — the opt-in heritage overlay (county
              GIS). Small muted stone-gray dots, quieter than any live
              layer: history is context, not a call to action. Tapping
              one opens the popup below with the name + locale. */}
          <Source
            id="cemeteries"
            type="geojson"
            data={(showCemeteries ? cemeteryGeoJson : { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection}
          >
            <Layer
              id="cemetery-icons"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 13, 4, 16, 5.5],
                // Muted stone gray — an ink tint, not a brand color, so
                // 250+ history dots read as texture under the live pins.
                "circle-color": "#6E6657",
                "circle-opacity": 0.85,
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.2,
              }}
            />
          </Source>

          {/* Cemetery popup — name, the locale the county files it
              under, and an honest note when the county itself marks the
              point approximate. No established date: the county layer
              doesn't carry one, and we never invent data. */}
          {selectedCemetery && (
            <Popup
              longitude={selectedCemetery.lng}
              latitude={selectedCemetery.lat}
              anchor="bottom"
              offset={12}
              closeOnClick={true}
              onClose={() => setSelectedCemetery(null)}
              maxWidth="240px"
            >
              <div style={{ padding: "2px 2px 4px", minWidth: 170 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--app-ink-3, #5C5A50)", margin: 0 }}>
                  Historic cemetery
                </p>
                <strong className="font-serif" style={{ display: "block", fontSize: 16, lineHeight: 1.2, color: "var(--app-ink, #16140E)", marginTop: 1 }}>
                  {selectedCemetery.name}
                </strong>
                {selectedCemetery.place && (
                  <p style={{ marginTop: 4, fontSize: 12, color: "var(--app-ink-2, #423E34)" }}>
                    {selectedCemetery.place}
                  </p>
                )}
                {selectedCemetery.approximate && (
                  <p style={{ marginTop: 4, fontSize: 11, color: "var(--app-ink-3, #5C5A50)" }}>
                    This location is approximate and based on county records.
                  </p>
                )}
              </div>
            </Popup>
          )}

          {/* Event pins — the Frederick-only differentiator vs Google/
              Apple Maps. Each event in the next 48h plotted at its venue
              as a circular photo bubble (or category-colored badge when
              there's no hero image). Tapping opens a popup with a link
              to the event detail. */}
          {visibleEvents.map((e) => (
            <Marker
              key={`ev:${e.slug}`}
              ref={exposeMarkerChild}
              longitude={e.lng}
              latitude={e.lat}
              anchor="bottom"
              offset={eventOffsets[e.slug]}
            >
              <button
                type="button"
                tabIndex={eventSlugsInView.has(e.slug) ? 0 : -1}
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
                  className="fr-ev-pulse"
                  style={{
                    position: "absolute",
                    inset: 4,
                    borderRadius: 9999,
                    background: e.category_color || "var(--app-brand)",
                    opacity: 0.32,
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

          {/* Parking layer — the five downtown city garages as "P" glyph
              markers, tinted by LIVE availability (green plenty / amber
              filling / red full / ink unknown). DOM markers (not a GeoJSON
              layer) so each is a real ≥44px, keyboard-reachable button and
              the glyph stays crisp. Tapping raises the parking peek. */}
          {showParking &&
            parking.map((g) => {
              const tone = parkingTone(g);
              const { fill, ink } = PARKING_TONE_STYLE[tone];
              return (
                <Marker
                  key={`park:${g.slug}`}
                  ref={exposeMarkerChild}
                  longitude={g.lng}
                  latitude={g.lat}
                  anchor="bottom"
                >
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      haptic("light");
                      setSelected(null);
                      setSelectedEvent(null);
                      setPeekPlace(null);
                      setSelectedSlug(null);
                      setParkingPeek(g);
                    }}
                    aria-label={`${g.name} parking garage`}
                    className="fr-park-marker"
                    style={{ "--park-fill": fill, "--park-ink": ink } as React.CSSProperties}
                  >
                    <span aria-hidden className="fr-park-glyph">P</span>
                  </button>
                </Marker>
              );
            })}

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

          {/* Zoom stays as corner furniture — camera, not filter. With the
              dock now pinned at the TOP, the bottom-right corner is
              unobstructed, so dock-host CSS returns the zoom cluster there.
              GeolocateControl only rides dock-less maps: on /map browse,
              locate's one home is the Where pane. */}
          <NavigationControl position="bottom-right" showCompass={false} />
          {!dock && <GeolocateControl position="bottom-right" trackUserLocation />}
        </Map>

        {/* ── The dock: one instrument for the browse map. Scrim + card;
            collapsed face is the What · When · Where caption. ── */}
        {dock && (
          <div
            className="transition-opacity duration-200 motion-reduce:transition-none"
            style={{ opacity: mapMoving && !dockPaneOpen ? 0.35 : 1 }}
          >
          <MapDock
            browse={dock}
            placeCount={inViewPlaces.length}
            eventCount={visibleEvents.length}
            closingSoonCount={closingSoonCount}
            q={q}
            setQ={setQ}
            searchMatches={searchMatches}
            pickSearch={pickSearch}
            listView={listView}
            onToggleList={() => updateListView(!listView)}
            savedCount={followedSlugs.size}
            showSavedOnly={showSavedOnly}
            setShowSavedOnly={setShowSavedOnly}
            fieldNotesCount={fieldNotesCount}
            fieldNotesOnly={fieldNotesOnly}
            setFieldNotesOnly={setFieldNotesOnly}
            amenityCount={amenityCount}
            amenityGroups={amenityGroups}
            setAmenityGroups={setAmenityGroups}
            civicAvailable={civic.length > 0}
            showCivic={showCivic}
            setShowCivic={setShowCivic}
            transitCount={transitLines.features.length}
            showTransit={showTransit}
            setShowTransit={setShowTransit}
            trailCount={trailLines.features.length}
            showTrails={showTrails}
            setShowTrails={setShowTrails}
            aerialCount={AERIAL_PHOTOS.length}
            showAerial={showAerial}
            setShowAerial={setShowAerial}
            aerialSeasons={aerialSeasonItems}
            aerialSeason={aerialSeason}
            onAerialSeason={(k) => { setAerialSeason(k as AerialSeason); haptic("light"); }}
            cemeteryCount={cemeteries.length}
            showCemeteries={showCemeteries}
            setShowCemeteries={setShowCemeteries}
            parkingCount={parking.length}
            showParking={showParking}
            setShowParking={setShowParking}
            showRadar={showRadar}
            setShowRadar={setShowRadar}
            showIncidents={showIncidents}
            setShowIncidents={setShowIncidents}
            showCameras={showCameras}
            setShowCameras={setShowCameras}
            showFireStations={showFireStations}
            setShowFireStations={setShowFireStations}
            radarFrameEpoch={radarFrameEpoch}
            activeOverlays={activeOverlays}
            toggleOverlay={toggleOverlay}
            scrubHour={scrubHour}
            setScrubHour={setScrubHour}
            userLoc={userLoc}
            locating={locating}
            geoMsg={geoMsg}
            goNearMe={goNearMe}
            flyTo={(center, zoom) => {
              cameraIntentRef.current = true;
              mapRef.current?.getMap().flyTo({
                center,
                zoom,
                duration: prefersReducedMotion() ? 0 : 1100,
                curve: 1.25,
                easing: CAM_EASE,
                essential: true,
              });
            }}
            fitCounty={fitCounty}
            onPaneOpenChange={setDockPaneOpen}
          />
          </div>
        )}

        {/* "Show the whole county" reset — one tap back to the overview when a
            user has zoomed or panned in and lost the lay of the land. Getting
            un-lost used to be buried under Filters → Where → Whole county.
            Stacked just above the locate FAB; only shown once off the overview
            so the default county view stays uncluttered. */}
        {dock && !listView && offOverview && (
          <button
            type="button"
            className="map-reset-fab tap-44"
            onClick={fitCounty}
            aria-label="Show the whole county"
          >
            <Shrink className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </button>
        )}

        {/* Persistent "near me" locate button — locate is the most-used
            map gesture, so it lives ON the map (above the zoom cluster),
            not only inside the Where pane. Dock surface only; hidden while
            a dock pane or the list is open. While locating, the icon swaps to
            a spinner (static under reduced motion) so the ~8s geolocation wait
            reads as working, not stuck. */}
        {dock && !listView && (
          <button
            type="button"
            className="map-locate-fab tap-44"
            onClick={goNearMe}
            aria-label="Find places near me"
            aria-busy={locating || undefined}
            data-on={userLoc ? true : undefined}
          >
            {locating ? (
              <LoaderCircle
                className="h-5 w-5 animate-spin motion-reduce:animate-none"
                strokeWidth={2.2}
                aria-hidden
              />
            ) : (
              <LocateFixed className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            )}
          </button>
        )}

        {/* The map's LIST face — the same filtered pins as a scannable
            roll. Honest empty state when nothing matches. */}
        {dock && listView && (
          <MapList
            places={visiblePlaces}
            userLoc={userLoc}
            onPick={(p) => {
              updateListView(false);
              setSelectedSlug(p.slug);
              const m = mapRef.current?.getMap();
              if (m && p.geom) {
                cameraIntentRef.current = true;
                smoothFocus(m, [p.geom.lng, p.geom.lat], { minZoom: 14 });
              }
              setParkingPeek(null);
              setPeekPlace(p);
            }}
          />
        )}

        {/* The pin peek card. The cross-join: the soonest event pin hosted
            AT this place (venue_place_slug) rides along, so tapping a
            brewery answers "anything on here tonight?" without leaving the
            map (2026-07-17 map audit #2). */}
        {peekPlace && !parkingPeek && !listView && (
          <MapPeek
            place={peekPlace}
            hostedEvent={
              events
                .filter((e) => e.venue_place_slug && e.venue_place_slug === peekPlace.slug)
                .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null
            }
            nearestGarage={
              // The third question after "open?" and "anything on?":
              // where do I park. Nearest downtown garage within a
              // 5-6 minute walk, with the live space count when the
              // feed reports one (2026-07-17 map audit follow-on).
              parking
                .map((g) => ({
                  g,
                  d: haversineMeters(peekPlace.geom, { lng: g.lng, lat: g.lat }),
                }))
                .filter((x) => x.d <= 500)
                .sort((a, b) => a.d - b.d)
                .map((x) => ({ name: x.g.name, distM: x.d, available: x.g.available }))[0] ?? null
            }
            userLoc={userLoc}
            onClose={() => {
              setPeekPlace(null);
              setSelectedSlug(null);
            }}
            onDetails={() => openPlaceSheet(peekPlace)}
          />
        )}

        {/* The parking garage peek — its own compact card (a garage isn't a
            saveable place): live spaces, hourly rate, and Directions. */}
        {parkingPeek && !listView && (
          <MapParkingPeek pin={parkingPeek} onClose={() => setParkingPeek(null)} />
        )}

        {/* MARC station popup — the next scheduled trains, as clock times
            from the committed GTFS schedule (weekday commuter service;
            honest empty line when no more trains today). */}
        {marcPeek && !listView && (() => {
          const st = marcStations.find((m) => m.name === marcPeek);
          if (!st) return null;
          return (
            <Popup
              longitude={st.lng}
              latitude={st.lat}
              anchor="bottom"
              onClose={() => setMarcPeek(null)}
              closeOnClick={false}
              maxWidth="260px"
            >
              <div style={{ fontFamily: "var(--font-inter, inherit)" }}>
                <p className="font-serif text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  MARC · {st.name}
                </p>
                {st.departures.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {st.departures.map((d, i) => (
                      <li key={i} className="text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                        <span className="font-mono">{d.clock}</span> to {d.headsign}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    No more departures are scheduled today.
                  </p>
                )}
              </div>
            </Popup>
          );
        })()}

        {/* Cluster index — "what's in this bubble", as a field-guide index
            page. Tapping a row focuses the pin + opens its sheet; the drawer
            dismisses itself so the map stays the page. */}
        <BottomDrawer
          title={clusterList ? `${clusterList.length} places here` : "Places"}
          subtitle="Tap one to see its card"
          open={clusterList !== null}
          onOpenChange={(o) => { if (!o) setClusterList(null); }}
        >
          <ul className="space-y-0.5 pb-4">
            {(clusterList ?? []).map((c) => (
              <li key={c.slug}>
                <button
                  type="button"
                  onClick={() => {
                    const pin = placesBySlug.get(c.slug);
                    setClusterList(null);
                    if (!pin) return;
                    setSelectedSlug(pin.slug);
                    haptic("light");
                    const m = mapRef.current?.getMap();
                    if (m) {
                      cameraIntentRef.current = true;
                      smoothFocus(m, [pin.geom.lng, pin.geom.lat], { minZoom: 15 });
                    }
                    setParkingPeek(null);
                    setPeekPlace(pin);
                  }}
                  className="tap-44 flex w-full items-center gap-2.5 rounded-[var(--app-radius-sm)] px-2 py-2 text-left transition-colors hover:bg-[var(--app-bg-sunken)]"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: BUCKET_COLOR[bucketOf(c.category)] ?? "var(--app-brand)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {CATEGORY_BY_SLUG[c.category]?.name ?? c.category}
                    {c.closing ? " · closing soon" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </BottomDrawer>
      </div>
  );
}
