"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Calendar,
  Toilet,
  Wifi,
  Zap,
  Bike,
  Trees,
  Baby,
  Waves,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { FREDERICK_CENTER, haversineMeters, formatDistance } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { readCachedPosition } from "@/hooks/useGeolocation";
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
      className="relative grid h-[78vh] w-full place-items-center overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
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

/**
 * "Useful nearby" amenity display config — glyph + label + accent for
 * each amenity kind the map can surface in the in-view list. Mirrors the
 * AMENITY_KINDS labels in the loader but adds the icon/color the compact
 * row needs. NOTE: parking and transit are deliberately absent — parking
 * is a place *category* (handled by the places list), and transit stops
 * aren't in the AmenityKind set yet (see docs/BACKLOG.md). When transit
 * data is plumbed in, add it here and it surfaces automatically.
 */
const AMENITY_DISPLAY: Record<
  AmenityKind,
  { label: string; icon: LucideIcon; color: string }
> = {
  restroom: { label: "Restroom", icon: Toilet, color: "var(--app-cool)" },
  wifi: { label: "Free Wi-Fi", icon: Wifi, color: "var(--app-cool)" },
  ev_charging: { label: "EV charging", icon: Zap, color: "var(--app-brand-2)" },
  bike_parking: { label: "Bike parking", icon: Bike, color: "var(--app-brand-2)" },
  picnic: { label: "Picnic", icon: Trees, color: "var(--app-brand-2)" },
  playground: { label: "Playground", icon: Baby, color: "var(--app-accent)" },
  pool: { label: "Pool", icon: Waves, color: "var(--app-cool)" },
  river_gauge: { label: "River gauge", icon: Activity, color: "var(--app-cool)" },
};

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
  autoOpenList = false,
  recenterToKnownLocation = false,
  pinpointDefault = false,
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
  /** Open the results drawer to its half snap on mount instead of the
   *  default peek — set when arriving via a category so the filtered
   *  list is the first thing the user sees. */
  autoOpenList?: boolean;
  /** Center the camera (and measure list distances) from the user's
   *  last-known location when we already have a cached fix — so the
   *  list reads closest-first "from where you're standing." Never
   *  prompts; falls back to the city center. */
  recenterToKnownLocation?: boolean;
  /** Pinpoint-first: open the browse map clean (no pins) until the user
   *  adds a category. Set when browsing with no server-side intent. */
  pinpointDefault?: boolean;
  /** Overlay content for the map column (the MapIntentChips strip).
   *  Lives inside the map column so it overlays only the map, never the
   *  desktop list pane. */
  children?: React.ReactNode;
}) {
  const [inView, setInView] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ slug: string; n: number } | null>(null);

  // The point we measure "how far" from. When we arrived via a category
  // and already have the user's consent-cached fix, sort/label distances
  // from where they're standing; otherwise fall back to the city center
  // (the map's default camera home). Read once on mount — no prompt.
  const origin = useMemo(() => {
    if (recenterToKnownLocation) {
      const cached = readCachedPosition();
      if (cached) return cached;
    }
    return FREDERICK_CENTER;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot read of the cached fix at mount
  }, []);

  const bySlug = useMemo(() => {
    const m = new Map<string, PlaceCardData>();
    for (const p of places) m.set(p.slug, p);
    return m;
  }, [places]);

  // Already decorated server-side; attach the viewport-relative distance
  // (pure, no loader/JSON in the client bundle; measured from `origin` so
  // the card distances match the list's sort home), then RANK by
  // usefulness so the list reads "best in this view," not "first thing the
  // map handed back." Order: open-now wins (a closed gem helps no one
  // right now), then editorial/quality lead (feature_score), then nearest.
  // Pure + deterministic, so the desktop pane and mobile drawer agree.
  const results = useMemo(
    () =>
      inView
        .map((slug) => bySlug.get(slug))
        .filter((p): p is PlaceCardData => Boolean(p))
        .map((p) => ({ ...p, distance_m: haversineMeters(origin, p.geom) }))
        .sort(rankInView),
    [inView, bySlug, origin]
  );

  // Shared by the desktop list pane and the mobile drawer so they never
  // drift. eventsHere = events near any visible place; openCount =
  // verified-open places in view (the headline pillar).
  const onPick = (slug: string) =>
    setFocus((f) => ({ slug, n: (f?.n ?? 0) + 1 }));
  const eventsHere = useMemo(
    () => eventsNearVisiblePlaces(events, results),
    [events, results],
  );
  // "Useful nearby" — the practical infrastructure (restrooms, water, EV,
  // bike parking, Wi-Fi, playgrounds) within a short walk of what's in
  // view. One per kind so the row reads as a checklist of what's handy,
  // not a wall of identical restroom pins. Shared by both presentations.
  const usefulHere = useMemo(
    () => amenitiesNearVisiblePlaces(amenities, results),
    [amenities, results],
  );
  const openCount = useMemo(
    () => results.filter((p) => isOpenNow(p.open_status)).length,
    [results],
  );

  // Full-bleed: the map fills the parent, the "In view" list lives
  // inside a slide-up bottom drawer that the user can collapse to a
  // peek. Standard mobile maps pattern (Apple Maps, Google Maps).
  if (fullBleed) {
    return (
      // Two-pane on desktop (lg+): a persistent list pane beside the map
      // (Apple/Google-Maps shape). Below lg it collapses to the mobile
      // full-screen map + slide-up drawer, unchanged. Both presentations
      // are always mounted and CSS-toggled, so the server and client
      // trees match — no hydration mismatch from viewport-detection JS.
      <div className="relative flex h-full w-full">
        {/* Desktop list pane */}
        <aside
          className="hidden min-h-0 lg:flex lg:w-[380px] lg:shrink-0 lg:flex-col lg:overflow-hidden lg:border-r xl:w-[420px]"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          aria-label="Places in view"
        >
          <InViewReadout
            count={results.length}
            openCount={openCount}
            eventsCount={eventsHere.length}
          />
          <InViewList
            results={results}
            eventsHere={eventsHere}
            usefulHere={usefulHere}
            onPick={onPick}
            variant="pane"
          />
        </aside>

        {/* Map column — fills the rest; chips overlay only this column */}
        <div className="relative h-full w-full lg:flex-1">
          {children}
          <AppMap
            places={places}
            onPlacesInView={setInView}
            focus={focus}
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
          />
          {/* Mobile slide-up drawer — hidden on desktop (pane replaces it) */}
          <InViewDrawer
            results={results}
            eventsHere={eventsHere}
            usefulHere={usefulHere}
            openCount={openCount}
            initialSnap={autoOpenList ? "half" : "peek"}
            onPick={onPick}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AppMap places={places} onPlacesInView={setInView} focus={focus} civic={civic} extraAmenities={extraAmenities} amenities={amenities} trailLines={trailLines} transitLines={transitLines} municipalBoundaries={municipalBoundaries} countyBoundary={countyBoundary} events={events} />

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="inline-flex items-center gap-1.5 font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            <MapPin className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
            In view
          </h2>
          <span className="text-xs tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {results.length === 0
              ? "Loading viewport…"
              : `${results.length} place${results.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {results.length === 0 ? (
          <p
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            Showing Downtown Frederick. As you pan or zoom, places in
            view list here — coffee, restaurants, parks, civic
            buildings, the whole county.
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map((p) => (
              <li
                key={p.slug}
                onClickCapture={() => setFocus((f) => ({ slug: p.slug, n: (f?.n ?? 0) + 1 }))}
              >
                <PlaceCard place={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Rank comparator for the in-view places list ("Best in this view").
 * Three tiers, each breaking ties for the next:
 *   1. Open now beats closed — a closed place is no help to someone
 *      standing here right now, however good it is.
 *   2. Higher feature_score beats lower — the editorial/quality signal,
 *      so the leads are places worth the trip, not arbitrary rows.
 *   3. Nearer beats farther — among equally-open, equally-good places,
 *      closest wins.
 * Pure + total, so both presentations sort identically. Exported for
 * unit tests.
 */
export function rankInView(a: PlaceCardData, b: PlaceCardData): number {
  const ao = isOpenNow(a.open_status) ? 1 : 0;
  const bo = isOpenNow(b.open_status) ? 1 : 0;
  if (ao !== bo) return bo - ao;
  const af = a.feature_score ?? 0;
  const bf = b.feature_score ?? 0;
  if (af !== bf) return bf - af;
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
 * Exported for unit tests; the runtime consumer is InViewDrawer below.
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

/**
 * The synced "in view" list body — shared by the mobile drawer and the
 * desktop side pane so the two never drift. Events near the visible
 * places are promoted above the places list (time-sensitive beats
 * time-flat). `variant` only swaps the scroll container's chrome: the
 * drawer reserves vertical pans for native scroll over the map canvas;
 * the pane is a plain scroll column.
 */
function InViewList({
  results,
  eventsHere,
  usefulHere,
  onPick,
  variant,
}: {
  results: PlaceCardData[];
  eventsHere: EventPin[];
  usefulHere: UsefulAmenity[];
  onPick: (slug: string) => void;
  variant: "drawer" | "pane";
}) {
  const isDrawer = variant === "drawer";
  // Lead with the best handful; the long tail sits behind "See all N" so
  // the list answers "what's worth my time here" before it becomes a
  // directory. Collapsed by default; resets implicitly when the parent
  // remounts with a new viewport is NOT desired (panning keeps your
  // expansion), so this is plain local state.
  const [showAll, setShowAll] = useState(false);
  const CAP = 6;
  const visiblePlaces = showAll ? results : results.slice(0, CAP);
  const hiddenCount = results.length - visiblePlaces.length;
  return (
    <ul
      className={
        isDrawer
          ? "reveal-up min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3"
          : "min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
      }
      style={
        isDrawer
          ? { touchAction: "pan-y", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }
          : undefined
      }
      onTouchStart={isDrawer ? (e) => e.stopPropagation() : undefined}
      onTouchMove={isDrawer ? (e) => e.stopPropagation() : undefined}
    >
      {results.length === 0 ? (
        <li
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          Pan or zoom to scan this area. Places list here; tap any to open details.
        </li>
      ) : (
        <>
          {/* Promoted-section model: Events nearby → Useful nearby →
              Best in this view. Time-sensitive leads, then the practical
              infrastructure, then the ranked places. */}

          {/* Events nearby — promoted ABOVE everything when the visible
              viewport has any. A concert at Carroll Creek tonight should
              beat 12 restaurant rows. Full details on the event page. */}
          {eventsHere.length > 0 && (
            <li>
              <p
                className="mb-1.5 mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-brand)" }}
              >
                <Calendar className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                Events nearby
              </p>
              <ul className="space-y-1.5">
                {eventsHere.slice(0, 5).map((e) => {
                  const start = new Date(e.starts_at);
                  const when = new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/New_York",
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(start);
                  const color = e.category_color ?? "var(--app-brand)";
                  return (
                    <li key={e.slug}>
                      <Link
                        href={`/events/${e.slug}`}
                        className="tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2"
                        style={{ borderColor: "var(--app-border)", boxShadow: `inset 3px 0 0 ${color}` }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                            {e.title}
                          </p>
                          <p className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                            {when} · {e.venue_name}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          {/* Useful nearby — the practical infrastructure within a short
              walk. One compact chip per kind, nearest first. Non-tappable
              (these are reference points, not detail pages); the distance
              is the payload. */}
          {usefulHere.length > 0 && (
            <li>
              <p
                className="mb-1.5 mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--app-cool)" }}
              >
                <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                Useful nearby
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {usefulHere.map((a) => {
                  const d = AMENITY_DISPLAY[a.kind];
                  const Icon = d.icon;
                  return (
                    <li key={a.kind}>
                      <span
                        title={a.name}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] py-1 pl-1.5 pr-2.5"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <span
                          aria-hidden
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
                          style={{ background: `color-mix(in srgb, ${d.color} 16%, transparent)` }}
                        >
                          <Icon className="h-3 w-3" strokeWidth={2.25} style={{ color: d.color }} />
                        </span>
                        <span className="text-[12px] font-semibold" style={{ color: "var(--app-ink)" }}>
                          {d.label}
                        </span>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: d.color }}>
                          {formatDistance(a.distance_m)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          {/* Best in this view — the ranked places (open now → quality →
              nearest). Always labelled so the list reads as an answer, not
              a raw count. */}
          <li>
            <p
              className="mb-0.5 mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              Best in this view
            </p>
          </li>
          {/* Map results are compact, typographic DECISION cards — no photo
              thumbnails (the Map redesign brief: the sheet is a decision
              tool, not a gallery). noPhoto forces the category mark. */}
          {visiblePlaces.map((p) => (
            <li key={p.slug} onClickCapture={() => onPick(p.slug)}>
              <PlaceCard place={p} noPhoto />
            </li>
          ))}
          {(hiddenCount > 0 || showAll) && results.length > CAP && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="tactile-interactive w-full rounded-[var(--app-radius-md)] border border-dashed px-3 py-2.5 text-[12px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                {showAll ? "Show fewer" : `See all ${results.length}`}
              </button>
            </li>
          )}
        </>
      )}
    </ul>
  );
}

/**
 * Desktop pane header — the same decision facts the drawer's peek shows
 * (count · open now · events), as a static column header.
 */
function InViewReadout({
  count,
  openCount,
  eventsCount,
}: {
  count: number;
  openCount: number;
  eventsCount: number;
}) {
  return (
    <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
      <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
        {count === 0 ? (
          "Showing Downtown Frederick"
        ) : (
          <>
            {count} place{count === 1 ? "" : "s"}
            {openCount > 0 && (
              <>
                {" · "}
                <span style={{ color: "var(--app-positive)" }}>{openCount} open now</span>
              </>
            )}
            {eventsCount > 0 && (
              <>
                {" · "}
                <span style={{ color: "var(--app-brand)" }}>
                  {eventsCount} event{eventsCount === 1 ? "" : "s"} nearby
                </span>
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * InViewDrawer — slide-up bottom drawer inside the full-bleed map.
 * Three snap states (peek / half / full) tracked client-side. Peek
 * shows just the count + a grab handle; half + full reveal the
 * synced "places + events in view" list scrollable. Apple Maps shape.
 *
 * The mobile review's #1 priority was making this the keystone mobile
 * interaction. The drawer now surfaces BOTH places-in-view and events
 * near those places, so a user panning to Carroll Creek immediately
 * sees "12 places · 3 events nearby" — they can decide-by-day without
 * leaving the map.
 */
function InViewDrawer({
  results,
  eventsHere,
  usefulHere,
  openCount,
  initialSnap = "peek",
  onPick,
}: {
  results: PlaceCardData[];
  /** Events near the visible places — computed once in the parent and
   *  shared with the desktop pane so the two never drift. */
  eventsHere: EventPin[];
  /** "Useful nearby" amenities — computed once in the parent and shared
   *  with the desktop pane so the two never drift. */
  usefulHere: UsefulAmenity[];
  /** Verified-open count in view — computed once in the parent. */
  openCount: number;
  /** Snap state on mount — "half" when arriving via a category so the
   *  filtered list is visible immediately; "peek" otherwise. */
  initialSnap?: "peek" | "half" | "full";
  onPick: (slug: string) => void;
}) {
  const [snap, setSnap] = useState<"peek" | "half" | "full">(initialSnap);
  // CSS height per snap (the resting target). The drag math below
  // mirrors these as fractions so the live finger-follow and the
  // resting state agree: peek is a fixed handle height, half/full are
  // shares of the map area (the drawer's containing block).
  const heights: Record<typeof snap, string> = {
    peek: "100px",
    half: "55%",
    full: "82%",
  };
  const PEEK_PX = 100;
  const HALF_FRAC = 0.55;
  const FULL_FRAC = 0.82;

  // ── Draggable sheet ──
  // The sheet used to only tap-cycle peek→half→full, which read as
  // broken on a phone — every thumb tries to *drag* a bottom sheet. We
  // now follow the finger live and snap to the nearest detent on
  // release, with a velocity fling so a quick flick jumps a level
  // (Apple/Google Maps behavior). Tap (no real movement) still cycles.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{
    startY: number;
    startH: number;
    curPx: number;
    lastY: number;
    lastT: number;
    v: number; // px/ms, positive = dragging upward (growing)
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const containerH = () =>
    sheetRef.current?.parentElement?.getBoundingClientRect().height ??
    (typeof window !== "undefined" ? window.innerHeight : 800);
  const snapPx = (s: "peek" | "half" | "full") => {
    if (s === "peek") return PEEK_PX;
    const H = containerH();
    return s === "half" ? H * HALF_FRAC : H * FULL_FRAC;
  };

  const onHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const startH =
      sheetRef.current?.getBoundingClientRect().height ?? snapPx(snap);
    drag.current = {
      startY: e.clientY,
      startH,
      curPx: startH,
      lastY: e.clientY,
      lastT: e.timeStamp,
      v: 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.min(
      snapPx("full"),
      Math.max(PEEK_PX, d.startH + (d.startY - e.clientY)),
    );
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.curPx = next;
    if (Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    setDragPx(next);
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (!d.moved) {
      // A tap, not a drag — let onClick handle the cycle.
      setDragPx(null);
      return;
    }
    // A real drag happened; swallow the synthetic click that follows.
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 360);

    const order = ["peek", "half", "full"] as const;
    let target = order.reduce((best, s) =>
      Math.abs(snapPx(s) - d.curPx) < Math.abs(snapPx(best) - d.curPx)
        ? s
        : best,
    );
    // Velocity fling: a quick flick jumps one detent past the nearest.
    const FLING = 0.5; // px/ms
    const idx = order.indexOf(target);
    if (d.v > FLING && idx < 2) target = order[idx + 1];
    else if (d.v < -FLING && idx > 0) target = order[idx - 1];

    setSnap(target);
    setDragPx(null);
  };

  // Category mix for the peek pill — shows the dominant categories
  // in the visible viewport as colored dots sized by share. Lets the
  // user read "mostly food + arts" at a glance without expanding.
  const categoryMix = useMemo(() => {
    if (results.length === 0) return [];
    const counts = new Map<string, number>();
    for (const p of results) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([slug, count]) => ({
        slug,
        count,
        color: CATEGORY_BY_SLUG[slug]?.color ?? "var(--app-brand)",
        name: CATEGORY_BY_SLUG[slug]?.name ?? slug,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [results]);

  return (
    <div
      ref={sheetRef}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[var(--z-map-drawer)] mx-auto flex w-full max-w-screen-md flex-col rounded-t-[var(--app-radius-xl)] bg-[var(--app-bg-elevated)] tactile-e3 lg:hidden"
      style={{
        height: dragPx != null ? `${dragPx}px` : heights[snap],
        // No transition while the finger is down — the sheet must track
        // 1:1. The spring only plays on release / programmatic snaps.
        transition: dragPx != null ? "none" : "height 280ms var(--app-ease-spring)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"));
        }}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        aria-label={snap === "full" ? "Collapse list" : "Expand list"}
        className="flex shrink-0 cursor-grab touch-none select-none flex-col items-center justify-center gap-1.5 pb-2.5 pt-2.5 active:cursor-grabbing"
      >
        <span
          aria-hidden
          className="h-1 w-10 rounded-full"
          style={{ background: "rgba(0,0,0,0.18)" }}
        />
        <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          {results.length === 0 ? (
            "Showing Downtown Frederick"
          ) : (
            <>
              {results.length} place{results.length === 1 ? "" : "s"}
              {openCount > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-positive)" }}>
                    {openCount} open now
                  </span>
                </>
              )}
              {eventsHere.length > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-brand)" }}>
                    {eventsHere.length} event{eventsHere.length === 1 ? "" : "s"} nearby
                  </span>
                </>
              )}
            </>
          )}
        </p>
        {/* Category mix row — visible only in peek state. Each dot is
            a category present in the visible viewport; size scales
            with that category's share of the total visible places.
            Gives the user a "what's here" read without expanding. */}
        {snap === "peek" && categoryMix.length > 0 && (
          <span
            aria-hidden
            className="flex items-center gap-1.5"
            title={categoryMix.map((c) => `${c.name} · ${c.count}`).join("\n")}
          >
            {categoryMix.map((c) => {
              // 6–14px range — biggest dot for the dominant category.
              const top = categoryMix[0].count;
              const size = Math.max(6, Math.min(14, Math.round(6 + (c.count / top) * 8)));
              return (
                <span
                  key={c.slug}
                  className="inline-block rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: c.color,
                    boxShadow: `0 0 0 1.5px ${c.color}22`,
                  }}
                />
              );
            })}
          </span>
        )}
      </button>
      {snap !== "peek" && (
        <InViewList
          results={results}
          eventsHere={eventsHere}
          usefulHere={usefulHere}
          onPick={onPick}
          variant="drawer"
        />
      )}
    </div>
  );
}
