"use client";

import { useEffect, useMemo, useState } from "react";
import { Footprints, Bike, Car, MapPin, ChevronDown, Locate, X, Compass } from "lucide-react";
import PlaceCard from "@/components/place/PlaceCard";
import SectionHeading from "@/components/ui/SectionHeading";
import FilterChip from "@/components/ui/FilterChip";
import RadiusMap from "./RadiusMap";
import RadiusPresets from "./RadiusPresets";
import BestNearbyMoves from "./BestNearbyMoves";
import { resolveMunicipality } from "@/lib/location";
// Read the same slim, pre-decorated set the rest of the app uses on
// the client. The previous shape (places passed in via props from
// radius/page) inlined ~4MB of redundant JSON into the SSR HTML for
// every cold visit — the bundle ALREADY ships places-client.json, so
// the server payload was a pure duplicate. clientPlaces() returns
// the same canonical operational set, decorated, cached as a const.
import { clientPlaces } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
// TYPE ONLY: the points arrive as a server prop (radius/page →
// allAmenities()), so this client component never imports the loader
// or amenities.json — same loader-free discipline as places.
import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { cuisineFacets, cuisinesOf } from "@/lib/cuisine";
import { MUNICIPALITIES } from "@/data/municipalities";
import {
  minutesToMeters,
  haversineMeters,
  isInsideFrederickCounty,
  type TravelMode,
  formatDistance,
} from "@/lib/geo";

// Center options: ALL 12 municipalities (Frederick first = default) +
// a couple of landmark points. A dropdown, not a hidden horizontal
// scroll — every choice is reachable and obvious. Municipalities come
// straight from the canonical data so the county is fully covered.
type Preset = {
  slug: string;
  label: string;
  lng: number;
  lat: number;
  kind: "muni" | "poi";
};
const MUNI_PRESETS: Preset[] = MUNICIPALITIES.map((m) => ({
  slug: `m-${m.slug}`,
  label: m.name,
  lng: m.centroid.lng,
  lat: m.centroid.lat,
  kind: "muni",
}));
const POI_PRESETS: Preset[] = [
  { slug: "carroll-creek", label: "Carroll Creek", lng: -77.4109, lat: 39.4137, kind: "poi" },
  { slug: "catoctin", label: "Catoctin trailhead", lng: -77.4505, lat: 39.6361, kind: "poi" },
];
const PRESETS: Preset[] = [...MUNI_PRESETS, ...POI_PRESETS];

const MODES: { mode: TravelMode; label: string; icon: typeof Footprints }[] = [
  { mode: "walk", label: "Walk", icon: Footprints },
  { mode: "bike", label: "Bike", icon: Bike },
  { mode: "drive", label: "Drive", icon: Car },
];

/**
 * Group every in-radius place by its TOP-LEVEL taxonomy category, so
 * nothing is invisible. The old 3 hardcoded buckets (eat/do/practical)
 * silently dropped ~9 of 12 top categories — that is why the namesake
 * tool "wasn't showing everything." This derives the group from the
 * real category tree (child → parent → top), with a "More" catch-all
 * so a place can never fall through. The sum of group counts always
 * equals the inside total — that invariant is the completeness proof.
 */
function groupKeyFor(category: string): string {
  const def = CATEGORY_BY_SLUG[category];
  if (!def) return "more";
  return def.parent ?? def.slug;
}
function groupLabel(key: string): string {
  return CATEGORY_BY_SLUG[key]?.name ?? "More";
}
function groupOrder(key: string): number {
  return CATEGORY_BY_SLUG[key]?.display_order ?? 9_000;
}

// "Walk", "Bike ride", "Drive" → the verb-noun form you say in
// conversation, which reads more naturally in the sentence-form
// headline than "walk/bike/drive" alone. "distance" (the raw-radius
// mode) gets a fallback that still reads sane in the same sentence.
const MODE_VERB: Record<TravelMode, string> = {
  walk: "walk",
  bike: "bike ride",
  drive: "drive",
  distance: "reach",
};

// ── Reachable-radius helpers ─────────────────────────────────────
// Tiny self-contained point-in-polygon so we don't pull in @turf for
// a 12-line ray-casting algorithm. Inputs are [lng,lat] tuples to
// match GeoJSON's coordinate ordering.

/**
 * Flatten a Mapbox Isochrone FeatureCollection into a list of raw
 * polygon rings (one per polygon — outer ring only; isochrone
 * polygons don't have holes in practice). Handles both Polygon and
 * MultiPolygon geometries so a fractured reachable area still works.
 */
function collectPolygons(fc: GeoJSON.FeatureCollection): number[][][] {
  const out: number[][][] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") {
      if (g.coordinates[0]) out.push(g.coordinates[0] as number[][]);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) {
        if (poly[0]) out.push(poly[0] as number[][]);
      }
    }
  }
  return out;
}

/**
 * Ray-casting point-in-polygon. Returns true if [lng,lat] lies inside
 * the polygon ring. Standard horizontal-ray odd-crossing test.
 */
function pointInPolygon(pt: [number, number], ring: number[][]): boolean {
  const x = pt[0];
  const y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    // Edge crosses the horizontal ray at y if endpoints are on
    // opposite sides AND the intersection x is to the right of the
    // test point. Toggling `inside` on each crossing gives the
    // odd-rule winding count.
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInAnyPolygon(pt: [number, number], polys: number[][][]): boolean {
  for (const ring of polys) {
    if (pointInPolygon(pt, ring)) return true;
  }
  return false;
}

/**
 * Oxford-comma list. "a, b, and c" — used by the sentence-form summary
 * so the headline reads as plain English instead of a UI label.
 */
function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

type ViewMode = "grid" | "list";
const VIEW_KEY = "fr:radius:view:v1";
type SortMode = "near" | "az";
const SORT_KEY = "fr:radius:sort:v1";
// How many to show before "Show all" expands a section in place. No
// data is hidden now — everything inside is one tap away. Distance-
// sorted, so the initial slice is always "the nearest few".
const PEEK: Record<ViewMode, number> = { grid: 8, list: 10 };
const FOOD_GROUP = "food";

// Geolocation cache + dismiss keys, hoisted so they're stable refs
// across renders (the lint rule wants them out of the effect's
// dependency array). Cache key matches useGeolocation's so the two
// share a single sessionStorage entry — they're orthogonal entry
// points into the same "where am I" state.
const GEO_CACHE_KEY = "fr_geo_v1";
const GEO_CACHE_TTL_MS = 1000 * 60 * 30; // 30 min — same as the hook
const GEO_PROMPT_DISMISS_KEY = "fr:geo-prompt-dismissed:v1";

type GeoStatus =
  | "idle"
  | "loading"
  | "granted"
  | "denied"
  | "unavailable"
  | "out-of-county";

// Local label + glyph table for the 6 curated amenity kinds, in
// most-asked-for order. Kept here (not imported from the loader) so
// this client component stays loader-free; the points themselves
// arrive as a server prop. Glyphs match the map's amenity language.
const AMENITY_META: { kind: AmenityKind; label: string; glyph: string }[] = [
  { kind: "restroom", label: "Restrooms", glyph: "\u{1F6BB}" },
  { kind: "wifi", label: "Free Wi-Fi", glyph: "\u{1F4F6}" },
  { kind: "ev_charging", label: "EV charging", glyph: "\u{26A1}" },
  { kind: "bike_parking", label: "Bike parking", glyph: "\u{1F6B2}" },
  { kind: "picnic", label: "Picnic spots", glyph: "\u{1FA91}" },
  { kind: "playground", label: "Playgrounds", glyph: "\u{1F6DD}" },
];

export default function RadiusBuilder({
  amenities = [],
}: {
  amenities?: Amenity[];
}) {
  // Places source: client-bundled, slim, already-decorated. Reading
  // here instead of taking via props removes ~4MB from /radius's SSR
  // HTML payload — the data was ALREADY on the client; the prop was
  // duplicating it as a serialized RSC payload. (Pre-2026-05-23.)
  const places: PlaceCardData[] = clientPlaces();
  const [presetIdx, setPresetIdx] = useState(0);
  const [mode, setMode] = useState<TravelMode>("walk");
  const [minutes, setMinutes] = useState(10);
  // Onboarding handoff: if the user picked a home municipality on
  // /welcome, jump to that preset on first paint instead of MUNI_PRESETS[0].
  // SSR-safe: server renders index 0, client overrides after mount.
  useEffect(() => {
    try {
      const homeMuni = localStorage.getItem("fr:home-muni:v1");
      if (!homeMuni) return;
      const idx = PRESETS.findIndex((p) => p.slug === `m-${homeMuni}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders preset 0; the stored home-muni overrides after mount
      if (idx > -1) setPresetIdx(idx);
    } catch {
      // localStorage unavailable — keep the default
    }
  }, []);
  // Default renders on the server; the stored preference is applied
  // after mount (same SSR-safe pattern the app uses elsewhere). A brief
  // default-then-preferred settle is acceptable for a view toggle.
  // View + sort: state is hydrated from localStorage on mount, but no
  // UI control changes them right now (toggles were retired in an
  // earlier compaction). The reads are still consumed in render so
  // a returning user keeps their last-chosen layout. If the toggles
  // come back, restore the persist wrappers — git history has them.
  const [view, setView] = useState<ViewMode>("grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders the default, the stored preference is applied after mount (localStorage is unavailable during SSR)
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      // localStorage unavailable (private mode, etc.) — keep default
    }
  }, []);
  const [sort, setSort] = useState<SortMode>("near");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders the default, the stored preference is applied after mount (localStorage is unavailable during SSR)
      if (saved === "near" || saved === "az") setSort(saved);
    } catch {
      // localStorage unavailable (private mode, etc.) — keep default
    }
  }, []);
  // Cuisine filter (food group only) + which groups are expanded.
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Onboarding handoff: pre-expand the group sections matching the
  // interests the user picked on /welcome step 3. Group keys are the
  // top-level category slug (e.g. "food", "outdoors", "arts"), which
  // is exactly what we stored in fr:interests:v1. Same SSR-safe
  // settle as the view + sort hydration above.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fr:interests:v1");
      if (!raw) return;
      const interests = JSON.parse(raw);
      if (!Array.isArray(interests) || interests.length === 0) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders an empty Set; the stored interests open matching sections after mount
      setExpanded(new Set(interests.filter((s) => typeof s === "string")));
    } catch {
      // localStorage unavailable or JSON garbled — keep default
    }
  }, []);
  // `seeAll` flips the page from "category tiles only" (default —
  // scan the buckets fast) to "every section expanded inline" (the
  // full directory view). User-flow fix: the old default landed on
  // a 6-section, 8-card-each wall before you could find your bucket.
  const [seeAll, setSeeAll] = useState(false);
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // "Use my location" — a custom center the user can opt into via
  // browser geolocation. Falls through to the preset list when null.
  //
  // The Radius redesign (May 2026) made this the SOUL of /map, but the
  // experience still anchored on town centroids until a user discovered
  // the small Locate button. Proposal A makes it the obvious first
  // move: surface a one-tap invite on first visit, hydrate a fresh
  // session-cached position so returning users skip the prompt, and
  // gracefully handle denied + out-of-county states instead of failing
  // silently.
  const [myLoc, setMyLoc] = useState<{ lng: number; lat: number } | null>(null);
  const [myLocLabel, setMyLocLabel] = useState<string>("Your location");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [promptDismissed, setPromptDismissed] = useState(false);

  // Hydrate cached position + dismiss state on mount. SSR-safe: the
  // server renders the idle state; the client overlays the cache if
  // it's still fresh. A returning user inside the 30-min TTL skips
  // the prompt entirely and lands on their own coordinates.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GEO_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as {
          lng: number;
          lat: number;
          label?: string;
          timestamp: number;
        };
        if (Date.now() - cached.timestamp <= GEO_CACHE_TTL_MS) {
          const inCounty = isInsideFrederickCounty(cached.lat, cached.lng);
          // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: server renders idle; the client hydrates sessionStorage which is unavailable during SSR
          setMyLoc({ lng: cached.lng, lat: cached.lat });
          setMyLocLabel(cached.label || "Your location");
          setGeoStatus(inCounty ? "granted" : "out-of-county");
        } else {
          sessionStorage.removeItem(GEO_CACHE_KEY);
        }
      }
    } catch {
      // sessionStorage unavailable — fall through to idle
    }
    try {
      if (localStorage.getItem(GEO_PROMPT_DISMISS_KEY) === "1") {
        setPromptDismissed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const requestMyLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const inCounty = isInsideFrederickCounty(lat, lng);
        const hit = resolveMunicipality({ lng, lat });
        // Inside a town → "Walkers Wood Park, MD"-style local label.
        // In-county but not in a town → just "Your location" (the dots
        // tell the story; we don't need to claim a neighborhood).
        // Out of county → "Near {nearest town}" so the user knows the
        // app sees them at the right distance.
        const label = inCounty
          ? hit.inside
            ? `${hit.municipality.name}, MD`
            : "Your location"
          : `Near ${hit.municipality.name}`;
        setMyLoc({ lng, lat });
        setMyLocLabel(label);
        setGeoStatus(inCounty ? "granted" : "out-of-county");
        try {
          sessionStorage.setItem(
            GEO_CACHE_KEY,
            JSON.stringify({
              lng,
              lat,
              accuracy: pos.coords.accuracy,
              label,
              timestamp: Date.now(),
            }),
          );
        } catch {
          // sessionStorage unavailable — non-fatal
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus("denied");
        } else {
          // Timeout / position unavailable — return to idle so the
          // user can try again. We don't surface a hard error; the
          // preset dropdown is still the working fallback.
          setGeoStatus("idle");
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  };

  // Permanent dismiss for the first-visit prompt. The Locate button in
  // the control card stays the always-on opt-in path; we just stop
  // pushing the big card at the top of the page.
  const dismissPrompt = () => {
    setPromptDismissed(true);
    try {
      localStorage.setItem(GEO_PROMPT_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  // Snap the center to the nearest municipality for an out-of-county
  // user — surfaces the closest sensible jumping-off point.
  const snapToNearestMuni = () => {
    if (!myLoc) return;
    const hit = resolveMunicipality(myLoc);
    const idx = PRESETS.findIndex((p) => p.slug === `m-${hit.municipality.slug}`);
    if (idx > -1) {
      setMyLoc(null);
      setMyLocLabel("Your location");
      setGeoStatus("idle");
      setPresetIdx(idx);
    }
  };

  // Derived flag — show the big invite card only when there's no
  // location yet, the user hasn't dismissed the prompt, and we're not
  // mid-fetch. The control-card button stays available throughout.
  const showGeoPrompt =
    geoStatus === "idle" && !promptDismissed && !myLoc;

  const presetCenter = PRESETS[presetIdx];
  const center = myLoc ? { ...presetCenter, label: myLocLabel, lng: myLoc.lng, lat: myLoc.lat } : presetCenter;
  const meters = minutesToMeters(mode, minutes);

  // Reachable Radius: the real isochrone polygon from Mapbox. Tells us
  // what's ACTUALLY within N minutes by walking/biking/driving on real
  // streets — not the straight-line circle, which lies whenever there's
  // a creek, a hill, a one-way, or a railroad in the way. Fetched as a
  // GeoJSON FeatureCollection from /api/isochrone, which proxies + caches
  // the Mapbox Isochrone API. While loading or on error, isochrone is
  // null and we fall back to the haversine circle filter below.
  const [isochrone, setIsochrone] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear the previous isochrone the moment center/mode/minutes change so the map doesn't show last query's polygon while the new one is fetching
    setIsochrone(null);
    const params = new URLSearchParams({
      lng: String(center.lng),
      lat: String(center.lat),
      mode,
      minutes: String(minutes),
    });
    fetch(`/api/isochrone?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && d.geojson) setIsochrone(d.geojson);
      })
      .catch(() => { /* keep null — falls back to circle */ });
    return () => { cancelled = true; };
  }, [center.lng, center.lat, mode, minutes]);

  const inside = useMemo(() => {
    // When the isochrone is loaded, filter by ACTUAL reachability
    // (point-in-polygon). Otherwise fall back to haversine distance
    // so the page always shows something useful even mid-fetch or on
    // upstream failure.
    const withDistance = places.map((p) => ({
      ...p,
      distance_m: haversineMeters({ lng: center.lng, lat: center.lat }, p.geom),
    }));
    const polys = isochrone ? collectPolygons(isochrone) : null;
    const filtered = polys && polys.length > 0
      ? withDistance.filter((p) => pointInAnyPolygon([p.geom.lng, p.geom.lat], polys))
      : withDistance.filter((p) => (p.distance_m ?? Infinity) <= meters);
    return filtered.sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
  }, [places, center.lng, center.lat, meters, isochrone]);

  // Complete, taxonomy-driven grouping: every in-radius place lands in
  // exactly one group, ordered by the category tree. Σ group counts ===
  // inside.length (the completeness invariant).
  const groups = useMemo(() => {
    const byKey = new Map<string, PlaceCardData[]>();
    for (const p of inside) {
      const k = groupKeyFor(p.category);
      const arr = byKey.get(k);
      if (arr) arr.push(p);
      else byKey.set(k, [p]);
    }
    return [...byKey.entries()]
      .map(([key, items]) => ({
        key,
        label: groupLabel(key),
        // "near" keeps inside's distance order; "az" sorts by name.
        items:
          sort === "az"
            ? [...items].sort((a, b) =>
                a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
              )
            : items,
      }))
      .sort((a, b) => {
        const d = groupOrder(a.key) - groupOrder(b.key);
        return d !== 0 ? d : b.items.length - a.items.length;
      });
  }, [inside, sort]);

  // Cuisine facets from the food group's actual contents, so the chip
  // row only ever offers cuisines that are genuinely nearby.
  const foodItems = useMemo(
    () => groups.find((g) => g.key === FOOD_GROUP)?.items ?? [],
    [groups],
  );
  const facets = useMemo(() => cuisineFacets(foodItems), [foodItems]);
  // A cuisine that is no longer present (radius changed) self-clears.
  const activeCuisine =
    cuisine && facets.some((f) => f.slug === cuisine) ? cuisine : null;

  // Slim shape passed to RadiusMap. Includes slug / name / category
  // color so the map can color dots by category and surface a place
  // preview when one is tapped — a generic mode-tinted dot was anonymous;
  // a category-colored dot tells a story at a glance.
  const insideDots = useMemo(
    () =>
      inside.map((p) => ({
        lng: p.geom.lng,
        lat: p.geom.lat,
        slug: p.slug,
        name: p.name,
        category: p.category,
        category_color: CATEGORY_BY_SLUG[p.category]?.color,
      })),
    [inside],
  );

  // (`edgePlace` — the place at the far edge — was used in the
  // floating ribbon, removed pre-launch per review §12. Trivia, not
  // a decision tool. The variable is gone too.)

  // Amenities inside the same radius — "what's within X" now genuinely
  // includes the restrooms / Wi-Fi / EV / bike / picnic / playgrounds,
  // not just businesses. Same haversine + center + meters as places.
  const insideAmenities = useMemo(() => {
    return amenities
      .map((a) => ({
        ...a,
        distance_m: haversineMeters(
          { lng: center.lng, lat: center.lat },
          { lng: a.lng, lat: a.lat },
        ),
      }))
      .filter((a) => a.distance_m <= meters)
      .sort((a, b) => a.distance_m - b.distance_m);
  }, [amenities, center.lng, center.lat, meters]);

  // Grouped by kind in the most-asked-for order; only kinds that
  // actually have a point inside the radius. Nearest stays first.
  const amenityGroups = useMemo(() => {
    const byKind = new Map<AmenityKind, (Amenity & { distance_m: number })[]>();
    for (const a of insideAmenities) {
      const arr = byKind.get(a.kind);
      if (arr) arr.push(a);
      else byKind.set(a.kind, [a]);
    }
    return AMENITY_META.map((m) => ({
      ...m,
      list: byKind.get(m.kind) ?? [],
    })).filter((g) => g.list.length > 0);
  }, [insideAmenities]);

  return (
    <div className="space-y-3">
      {/* First-visit invite card — the soul of the Radius redesign.
          Showing "what's around you" is the most useful thing this
          page can do, so we lead with it. Brand-orange CTA, soft
          gradient, dismissable. Persists the dismiss across visits
          via localStorage; the Locate button in the control card
          remains the quiet always-on opt-in path for users who
          dismissed the card but later change their mind. */}
      {showGeoPrompt && (
        <div
          className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] border p-3.5 shadow-[var(--app-shadow-1)]"
          style={{
            borderColor: "color-mix(in srgb, var(--app-brand) 36%, var(--app-border))",
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--app-brand) 12%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 70%)",
          }}
        >
          <button
            type="button"
            onClick={dismissPrompt}
            aria-label="Dismiss"
            className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full transition active:scale-[0.94]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
          <div className="flex items-start gap-3 pr-7">
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-[var(--app-shadow-1)]"
              style={{ background: "var(--app-brand)", color: "white" }}
            >
              <Locate className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="font-serif text-[16px] font-semibold leading-snug tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                What&rsquo;s around you, right now.
              </p>
              <p
                className="mt-0.5 text-[12px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                Center the radius on your spot. Stays in your browser &mdash; we don&rsquo;t store it.
              </p>
              <button
                type="button"
                onClick={requestMyLocation}
                className="tactile tactile-interactive mt-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-[var(--app-shadow-1)] transition active:scale-[0.96]"
                style={{ background: "var(--app-brand)" }}
              >
                <Locate className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Use my location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Out-of-county banner — granted but outside Frederick County.
          We still show the user's location on the map (so they can see
          how far they are), but we surface the closest in-county town
          as a one-tap fix so they're not stranded on an empty radius. */}
      {geoStatus === "out-of-county" && myLoc && (() => {
        const hit = resolveMunicipality(myLoc);
        const distMi = (hit.distance_m / 1609.344).toFixed(1);
        return (
          <div
            className="flex items-start gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-2.5"
            style={{
              borderColor: "var(--app-border)",
              background:
                "color-mix(in srgb, var(--app-ink-3) 6%, var(--app-bg-elevated))",
            }}
          >
            <Compass
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                You&rsquo;re about {distMi} mi outside Frederick County.
              </p>
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                The whole app is built for the county. Closest town from you is {hit.municipality.name} &mdash; want to center there?
              </p>
              <button
                type="button"
                onClick={snapToNearestMuni}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition active:scale-[0.96]"
                style={{
                  background: "var(--app-bg-elevated)",
                  color: "var(--app-brand)",
                  border: "1px solid color-mix(in srgb, var(--app-brand) 50%, var(--app-border))",
                }}
              >
                <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Center on {hit.municipality.name}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Denied banner — quiet, brief, with a clear "how to fix" line.
          Self-dismisses the moment the user successfully grants
          permission (geoStatus moves to granted/out-of-county). */}
      {geoStatus === "denied" && (
        <div
          className="flex items-start gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-2.5"
          style={{
            borderColor: "var(--app-border)",
            background:
              "color-mix(in srgb, var(--app-ink-3) 6%, var(--app-bg-elevated))",
          }}
        >
          <Compass
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={2}
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Couldn&rsquo;t access your location.
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
              Enable it in your browser settings, or pick a center below.
            </p>
          </div>
        </div>
      )}

      {/* Map + floating ribbon. Wrapped in a relative container so the
          stats can overlay the map bottom (Apple Maps pattern). The
          previous standalone ribbon section ate ~50px and pushed the
          slider further from the map. */}
      <div className="relative">
        <RadiusMap
          mode={mode}
          meters={meters}
          center={{ lng: center.lng, lat: center.lat }}
          centerLabel={center.label}
          insidePlaces={insideDots}
          reachable={isochrone}
          onCenterChange={(next) => {
            setMyLoc(next);
            setMyLocLabel("Pinned point");
          }}
        />
        {/* Floating ribbon — overlays the map's bottom edge. Same
            information as the old standalone strip in 1/3 the page
            height because it borrows the map's space. */}
        <div
          className="pointer-events-none absolute inset-x-3 bottom-3 z-20"
          aria-hidden
        >
          <div
            className="pointer-events-auto flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[12px] shadow-[var(--app-shadow-2)] backdrop-blur"
            style={{
              background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
              border: "1px solid var(--app-border)",
            }}
          >
            <span
              className="inline-flex items-center gap-1 font-semibold tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              <span className="font-serif text-[15px]">{minutes}</span>
              {/* "min walk" / "min bike" / "min drive" — the verb is
                  what makes the time interval mean something. Without
                  it, "10 min" reads as ambient and the user has to
                  infer the mode from elsewhere. */}
              <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                min {mode} · {formatDistance(meters)}
              </span>
            </span>
            <span className="h-3 w-px" style={{ background: "var(--app-border)" }} aria-hidden />
            <span
              className="inline-flex items-center gap-1 font-semibold tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              <span className="font-serif text-[15px]">{inside.length.toLocaleString()}</span>
              {/* "places in radius" rather than just "places" — answers
                  the stranger's "of what?" without forcing them to
                  trace back to the page name. */}
              <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                {`${inside.length === 1 ? "place" : "places"} in radius`}
              </span>
            </span>
            {/* "farthest: Hill House Bed and Breakfast" was here.
                Removed pre-launch (review §12): the user needs the
                best nearby thing at the top of /radius, not the
                farthest. Keep the count + mode + distance; cut the
                trivia. */}
          </div>
        </div>
      </div>

      {/* Best nearby moves — three curated "you should do this right
          now" tiles (coffee within reach, public restroom, park
          within reach) derived from the same inside list as the
          grid below. Pre-launch review §4: /radius needs to feel
          assistive, not directory-style. Self-hides each tile when
          there's no match in the current radius — so dialing all
          the way down doesn't render a row of empty placeholders. */}
      <BestNearbyMoves
        places={inside}
        amenities={insideAmenities}
        mode={mode}
      />

      {/* Compact control card — center + mode + slider in one tight
          stack so the entire instrument fits under the map in one
          mobile viewport. */}
      <section className="space-y-2.5 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)]"
               style={{ borderColor: "var(--app-border)" }}>
        {/* Center — a dropdown with every municipality + landmarks
            PLUS a "Use my location" button so the user has a real
            custom-center path. Obvious, fully reachable. */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)", color: "var(--app-brand)" }}
          >
            <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="relative min-w-0 flex-1">
            <label htmlFor="center-select" className="sr-only">Center point</label>
            <select
              id="center-select"
              value={myLoc ? -1 : presetIdx}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 0) {
                  setMyLoc(null);
                  setPresetIdx(v);
                }
              }}
              className="w-full appearance-none rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] py-2 pl-3 pr-9 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              {myLoc && (
                <option value={-1}>{myLocLabel}</option>
              )}
              <optgroup label="Municipalities">
                {PRESETS.map((p, i) =>
                  p.kind === "muni" ? (
                    <option key={p.slug} value={i}>{p.label}</option>
                  ) : null,
                )}
              </optgroup>
              <optgroup label="Landmarks">
                {PRESETS.map((p, i) =>
                  p.kind === "poi" ? (
                    <option key={p.slug} value={i}>{p.label}</option>
                  ) : null,
                )}
              </optgroup>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
              strokeWidth={2.25}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </div>
          {/* Use my location — geolocation override for "what's near
              ME right now" without picking a preset. Once set, it
              shows in the dropdown as "Your location" and persists
              until the user picks a different center. */}
          <button
            type="button"
            onClick={requestMyLocation}
            aria-pressed={Boolean(myLoc)}
            aria-busy={geoStatus === "loading" || undefined}
            title={
              geoStatus === "denied"
                ? "Location blocked — enable in browser settings"
                : myLoc
                  ? "Using your location"
                  : "Center on your location"
            }
            disabled={geoStatus === "unavailable"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border transition active:scale-[0.94] disabled:opacity-40"
            style={{
              borderColor: myLoc ? "var(--app-brand)" : "var(--app-border)",
              background: myLoc
                ? "color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated))"
                : "var(--app-bg-elevated)",
              color: myLoc ? "var(--app-brand)" : "var(--app-ink-2)",
            }}
          >
            <Locate
              className={`h-4 w-4 ${geoStatus === "loading" ? "animate-pulse" : ""}`}
              strokeWidth={myLoc ? 2.5 : 2}
              fill={myLoc ? "currentColor" : "none"}
              aria-hidden
            />
          </button>
        </div>

        {/* Mode + distance read as one instrument. */}
        <div
          role="group"
          aria-label="Travel mode"
          className="grid grid-cols-3 rounded-[var(--app-radius-md)] border p-0.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
        >
          {MODES.map(({ mode: m, label, icon: Icon }) => {
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={active}
                className="flex items-center justify-center gap-1.5 rounded-[calc(var(--app-radius-md)-3px)] py-1.5 text-[13px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--app-brand)" : "transparent",
                  color: active ? "#fff" : "var(--app-ink-2)",
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        {/* Slider — single row, inline minute display. Range labels
            tucked below at 10px so they don't add height. */}
        <div>
          <input
            id="minutes-slider"
            aria-label={`${minutes} minutes`}
            type="range"
            min={3}
            max={mode === "walk" ? 30 : mode === "bike" ? 20 : 15}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: "var(--app-brand)" }}
          />
          <div className="-mt-0.5 flex justify-between text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            <span>3 min</span>
            <span>{mode === "walk" ? 30 : mode === "bike" ? 20 : 15} min</span>
          </div>
        </div>
      </section>

      {/* Quick-pick chips — one tap sets BOTH mode and minutes for
          the six most-asked-for combinations. */}
      <RadiusPresets
        mode={mode}
        minutes={minutes}
        onPick={(m, n) => {
          setMode(m);
          setMinutes(n);
        }}
      />

      {/* Category tile grid — the new landing for the lower half.
          Compact, colorful, scannable. Tap a tile to expand JUST
          that section inline below. Default is tiles-only; the user
          can flip to the full directory view with "See everything".
          Headline is sentence-form ("You're within a 10-minute walk of
          food, parks, and arts.") so the page reads as an ANSWER, not
          a numeric count. The count moves below as the secondary line.
          Implicitly responds to a quick-pick tap too: the sentence
          rewrites the moment mode/minutes change. */}
      {groups.length > 0 && (
        <section aria-label="Categories in radius" className="space-y-3">
          <header className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                Inside this radius
              </p>
              <h2
                className="mt-0.5 font-serif text-[18px] font-semibold leading-snug tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {(() => {
                  const tops = groups
                    .slice(0, 4)
                    .map((g) => g.label.toLowerCase());
                  if (tops.length === 0) {
                    return `${inside.length} place${inside.length === 1 ? "" : "s"} within this radius.`;
                  }
                  return `You're within a ${minutes}-minute ${MODE_VERB[mode]} of ${formatList(tops)}.`;
                })()}
              </h2>
              <p
                className="mt-1 text-[11px] tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {/* Single template literal so React renders this as
                    ONE text node. Splitting it into JSX expressions
                    (e.g. "place{N === 1 ? '' : 's'} · {C} categor...")
                    creates multiple text nodes that screen readers
                    and text extractors concatenate with whitespace,
                    rendering "488 place s · 11 categor ies." */}
                {`${inside.length.toLocaleString()} ${inside.length === 1 ? "place" : "places"} · ${groups.length} ${groups.length === 1 ? "category" : "categories"}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSeeAll((v) => !v)}
              className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition active:scale-[0.96]"
              style={{
                background: seeAll ? "var(--app-brand)" : "var(--app-bg-elevated)",
                color: seeAll ? "white" : "var(--app-ink-2)",
                border: `1px solid ${seeAll ? "var(--app-brand)" : "var(--app-border)"}`,
              }}
              aria-pressed={seeAll}
            >
              {seeAll ? "Hide all" : "See everything"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${seeAll ? "rotate-180" : ""}`}
                strokeWidth={2.25}
                aria-hidden
              />
            </button>
          </header>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {groups.map((g) => {
              const color = CATEGORY_BY_SLUG[g.key]?.color ?? "#A8462C";
              const isOpen = expanded.has(g.key) || seeAll;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => toggleExpand(g.key)}
                  aria-expanded={isOpen}
                  className="tactile tactile-interactive relative flex items-center justify-between gap-2 overflow-hidden rounded-[var(--app-radius-md)] px-3.5 py-2.5 text-left"
                  style={{
                    background: isOpen
                      ? `linear-gradient(135deg, color-mix(in srgb, ${color} 32%, var(--app-bg-elevated)), color-mix(in srgb, ${color} 10%, var(--app-bg-elevated)))`
                      : "var(--app-bg-elevated)",
                    boxShadow: isOpen ? `0 8px 22px -10px ${color}` : undefined,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: color }}
                  />
                  <span className="relative min-w-0 flex-1 truncate">
                    <span
                      className="block font-serif text-[14px] font-semibold leading-tight tracking-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {g.label}
                    </span>
                    <span
                      className="block text-[10px] font-bold uppercase tracking-[0.08em]"
                      style={{ color }}
                    >
                      {`${g.items.length} ${g.items.length === 1 ? "place" : "places"}`}
                    </span>
                  </span>
                  <ChevronDown
                    className={`relative h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.25}
                    style={{ color }}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Every in-radius place, grouped by the real category tree —
          rendered only for sections the user has expanded (via tap
          on the tile above) OR when "See everything" is on. The food
          group also gets a cuisine filter built from what is
          actually nearby. */}
      {groups.map((g) => {
        const isFood = g.key === FOOD_GROUP;
        const filtered =
          isFood && activeCuisine
            ? g.items.filter((p) => cuisinesOf(p).includes(activeCuisine))
            : g.items;
        const isOpen = expanded.has(g.key) || seeAll;
        if (!isOpen) return null;
        const peek = PEEK[view];
        const shown = filtered;
        const overflow = filtered.length - shown.length;
        return (
          <section key={g.key} className="space-y-3">
            <SectionHeading title={g.label} count={g.items.length} />

            {isFood && facets.length > 1 && (
              // Wrapped, not scrolled — every cuisine is visible at a
              // glance so the filter is discoverable, never hidden off
              // the right edge.
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="All"
                  active={!activeCuisine}
                  onClick={() => setCuisine(null)}
                />
                {facets.map((f) => (
                  <FilterChip
                    key={f.slug}
                    label={f.label}
                    count={f.count}
                    active={activeCuisine === f.slug}
                    onClick={() =>
                      setCuisine(activeCuisine === f.slug ? null : f.slug)
                    }
                  />
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <p
                className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[12px]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                No {activeCuisine ? "matching" : ""} spots in this group inside the radius.
              </p>
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 gap-3">
                {shown.map((p) => (
                  <PlaceCard key={p.slug} place={p} variant="grid" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {shown.map((p) => (
                  <PlaceCard key={p.slug} place={p} variant="row" />
                ))}
              </div>
            )}

            {(overflow > 0 || isOpen) && filtered.length > peek && (
              <button
                type="button"
                onClick={() => toggleExpand(g.key)}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition active:opacity-70"
                style={{ color: "var(--app-brand)" }}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  strokeWidth={2.25}
                  aria-hidden
                />
                {isOpen
                  ? `Show fewer`
                  : `Show all ${filtered.length}${
                      isFood && activeCuisine ? "" : ` ${g.label.toLowerCase()}`
                    }`}
              </button>
            )}
          </section>
        );
      })}

      {/* Amenities inside the radius — restrooms, Wi-Fi, EV, bike
          parking, picnic, playgrounds. Each kind is a calm summary row
          (count + nearest) that expands to the full list, so "what's
          within X" genuinely includes them without a wall of pins. */}
      {amenityGroups.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Amenities" count={insideAmenities.length} />
          <div className="space-y-2">
            {amenityGroups.map((g) => {
              const key = `amenity:${g.kind}`;
              const isOpen = expanded.has(key);
              const nearest = g.list[0]?.distance_m ?? 0;
              return (
                <div
                  key={g.kind}
                  className="overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition active:opacity-80"
                  >
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px]"
                      style={{ background: "var(--app-bg-sunken)" }}
                    >
                      {g.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                        {g.label}
                      </span>
                      <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                        {g.list.length} within · nearest {formatDistance(nearest)}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      strokeWidth={2.25}
                      style={{ color: "var(--app-ink-3)" }}
                      aria-hidden
                    />
                  </button>
                  {isOpen && (
                    <ul>
                      {g.list.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 px-3.5 py-2 text-[13px]"
                          style={{ borderTop: "1px solid var(--app-border)" }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate" style={{ color: "var(--app-ink-2)" }}>
                              {a.name}
                            </span>
                            {a.detail && (
                              <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                                {a.detail}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                            {formatDistance(a.distance_m)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {inside.length === 0 && insideAmenities.length === 0 && (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
           style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          Nothing inside this radius. Move the slider, change the mode, or pick a different center.
        </p>
      )}
    </div>
  );
}
