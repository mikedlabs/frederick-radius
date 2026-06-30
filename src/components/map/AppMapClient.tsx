"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import { haversineMeters } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import type { Amenity, AmenityKind } from "@/lib/loaders/amenities";

const AppMap = dynamic(() => import("./AppMap"), {
  ssr: false,
  // Map-like skeleton instead of a bare "Loading map" line. The Mapbox
  // canvas cannot paint until its JS chunk arrives, but a tinted,
  // softly-pulsing field with a centered pin reads as "the map is
  // arriving" rather than "nothing has started," which makes the wait
  // feel intentional and shorter.
  loading: () => (
    <div
      className="relative grid w-full place-items-center overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
        height: "var(--app-browse-map-height)",
        borderColor: "var(--app-border)",
        background:
          "radial-gradient(120% 90% at 50% 35%, color-mix(in srgb, var(--app-cool) 12%, var(--app-bg-sunken)) 0%, var(--app-bg-sunken) 70%)",
      }}
      aria-busy="true"
      aria-label="Loading the map"
    >
      <div className="flex animate-pulse flex-col items-center gap-2">
        <span
          aria-hidden
          className="grid h-11 w-11 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-cool) 18%, var(--app-bg-elevated))",
            color: "var(--app-cool)",
          }}
        >
          <MapPin className="h-5 w-5" strokeWidth={2} />
        </span>
        <p className="text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
          Bringing up the map
        </p>
      </div>
    </div>
  ),
});

/**
 * Map + a results list synced to the viewport. Pan/zoom the map → the list
 * below shows exactly what's in view, nearest-center first, tappable
 * (opens the place sheet). This turns a wall of pins into something you
 * can actually browse.
 */
export type { CivicPin, MapLineFC, EventPin } from "./types";
import type { CivicPin, MapLineFC, EventPin } from "./types";
import type { OsmPlace } from "@/lib/integrations/overpass";

const EMPTY_FC: MapLineFC = { type: "FeatureCollection", features: [] };

export default function AppMapClient({
  places,
  civic = [],
  extraAmenities = [],
  amenities = [],
  trailLines = EMPTY_FC,
  transitLines = EMPTY_FC,
  municipalBoundaries = EMPTY_FC,
  countyBoundary = EMPTY_FC,
  events = [],
  fullBleed = false,
  recenterToKnownLocation = false,
  pinpointDefault = false,
  initialCenter,
  children,
}: {
  /** Already decorated server-side (map/page → publicPlaces().map
   *  (decoratePlace)). The client must NOT re-import the loader: it
   *  drags the ~12MB places-enrichment.json into the browser bundle
   *  and the map never loads. */
  places: PlaceCardData[];
  civic?: CivicPin[];
  /** Server-fetched amenity points (e.g. Mapillary trash) merged into
   *  the map's amenity layer — keeps the secret token server-side. */
  extraAmenities?: OsmPlace[];
  /** Curated civic amenities (amenities.json) — always-present set
   *  that backs the Amenities tray + Radius. */
  amenities?: Amenity[];
  /** Server-fetched toggleable line overlays (#3). */
  trailLines?: MapLineFC;
  transitLines?: MapLineFC;
  /** County GIS municipal boundary polygons — quiet always-on outline. */
  municipalBoundaries?: MapLineFC;
  /** County boundary polygon — the quiet always-on county edge (6.1). */
  countyBoundary?: MapLineFC;
  /** Upcoming events as photo pins — passed through to AppMap. The
   *  /map page filters to "happening soon" server-side so this stays a
   *  small (≤30 item) array. */
  events?: EventPin[];
  /** Full-bleed canvas: the map fills the parent, no card border, no
   *  "In view" list below. The map IS the page. The synced list lives
   *  in a slide-up sheet inside the map area instead. */
  fullBleed?: boolean;
  /** Center the camera (and measure list distances) from the user's
   *  last-known location when we already have a cached fix — so the
   *  list reads closest-first "from where you're standing." Never
   *  prompts; falls back to the city center. */
  recenterToKnownLocation?: boolean;
  /** Pinpoint-first: open the browse map clean (no pins) until the user
   *  adds a category. Set when browsing with no server-side intent. */
  pinpointDefault?: boolean;
  /** Seed the camera here (e.g. a /map?at=lat,lng deep-link from a park or
   *  trail row) instead of the county default. Forwarded to AppMap, whose
   *  initialZoom (14) frames it. Undefined -> AppMap's county default. */
  initialCenter?: [number, number];
  /** Overlay content for the map column (the MapIntentChips strip).
   *  Lives inside the map column so it overlays only the map, never the
   *  desktop list pane. */
  children?: ReactNode;
}) {
  // The in-view list panel (the desktop side pane + the mobile slide-up
  // "60 places · N open now · N events nearby" drawer) was removed per the
  // owner: the map IS the page. Tap a pin for its card; no bottom panel
  // narrating what's in view. Just the map with the chips/mode-toggle overlaid.
  if (fullBleed) {
    return (
      <div className="relative h-full w-full">
        {children}
        <AppMap
          places={places}
          civic={civic}
          extraAmenities={extraAmenities}
          amenities={amenities}
          trailLines={trailLines}
          transitLines={transitLines}
          municipalBoundaries={municipalBoundaries}
          countyBoundary={countyBoundary}
          events={events}
          fullBleed
          recenterToKnownLocation={recenterToKnownLocation}
          pinpointDefault={pinpointDefault}
          initialCenter={initialCenter}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AppMap places={places} civic={civic} extraAmenities={extraAmenities} amenities={amenities} trailLines={trailLines} transitLines={transitLines} municipalBoundaries={municipalBoundaries} countyBoundary={countyBoundary} events={events} initialCenter={initialCenter} />
    </div>
  );
}

/**
 * Sort comparator for the in-view places list. NEUTRAL by design — it is a
 * reflection of what's on the map, NOT a "best in view" ranking. There is no
 * editorial/quality (feature_score) tier, so the app never picks winners. Two
 * factual tiers:
 *   1. Open now beats closed — a closed place is no help to someone here now.
 *   2. Nearer beats farther.
 * Pure + total, so both presentations sort identically. Exported for tests.
 */
export function rankInView(a: PlaceCardData, b: PlaceCardData): number {
  const ao = isOpenNow(a.open_status) ? 1 : 0;
  const bo = isOpenNow(b.open_status) ? 1 : 0;
  if (ao !== bo) return bo - ao;
  return (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
}

/** An amenity decorated with its distance from the nearest visible place. */
export type UsefulAmenity = Amenity & { distance_m: number };

/**
 * The "Useful nearby" set: practical infrastructure (restrooms, water,
 * EV, bike parking, Wi-Fi, playgrounds…) within a short walk of what's
 * currently in view. Mirrors eventsNearVisiblePlaces — an amenity counts
 * if it sits within `maxMeters` of ANY visible place — but then keeps
 * only the NEAREST one per kind, so the row reads as a checklist of what's
 * handy ("restroom · water · EV") rather than a stack of identical pins.
 * Tighter radius than events (800m vs 1.5km): "useful nearby" should mean
 * a genuinely short walk. Nearest-kind first. Exported for unit tests.
 *
 * Data limits worth knowing: parking is a place *category*, not an
 * amenity, so it shows up in the places list, not here; transit stops
 * aren't in the AmenityKind set yet (docs/BACKLOG.md), so transit is
 * absent until that data is plumbed in.
 */
export function amenitiesNearVisiblePlaces(
  amenities: Amenity[],
  visible: { geom: { lng: number; lat: number } }[],
  maxMeters = 800,
): UsefulAmenity[] {
  if (amenities.length === 0 || visible.length === 0) return [];
  // Nearest match per kind.
  const best = new Map<AmenityKind, UsefulAmenity>();
  for (const a of amenities) {
    if (!Number.isFinite(a.lng) || !Number.isFinite(a.lat)) continue;
    let nearest = Infinity;
    for (const p of visible) {
      const d = haversineMeters({ lng: a.lng, lat: a.lat }, p.geom);
      if (d < nearest) nearest = d;
    }
    if (nearest > maxMeters) continue;
    const cur = best.get(a.kind);
    if (!cur || nearest < cur.distance_m) {
      best.set(a.kind, { ...a, distance_m: nearest });
    }
  }
  return [...best.values()].sort((x, y) => x.distance_m - y.distance_m);
}

/**
 * Filter events to those near the visible viewport. We use the set of
 * places currently in view as a proxy for the viewport: an event is
 * "nearby" if its venue sits within 1.5km of ANY place the user can
 * see. This works without plumbing a separate onEventsInView signal
 * out of AppMap, and degrades sensibly when the viewport is sparse
 * (zero visible places → no nearby events, which is the right answer:
 * if the user can't see anything to do, they can't see anywhere to
 * go either).
 *
 * Exported for unit tests (the in-view panel that consumed it at runtime was
 * removed; the helper is kept for the test contract + future reuse).
 */
export function eventsNearVisiblePlaces(
  events: EventPin[],
  visible: { geom: { lng: number; lat: number } }[],
  maxMeters = 1500,
): EventPin[] {
  if (events.length === 0 || visible.length === 0) return [];
  const out: EventPin[] = [];
  for (const e of events) {
    if (!Number.isFinite(e.lng) || !Number.isFinite(e.lat)) continue;
    for (const p of visible) {
      const d = haversineMeters({ lng: e.lng, lat: e.lat }, p.geom);
      if (d <= maxMeters) {
        out.push(e);
        break; // matched at least one — don't double-add
      }
    }
  }
  return out;
}

