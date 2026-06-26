import type { Metadata } from "next";
import { Suspense } from "react";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { getMunicipalBoundaries, getCountyBoundary } from "@/lib/integrations/fcGis";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import { allUpcoming, dedupeLiveAgainstCurated, isCivicEvent, type EventWithMeta } from "@/lib/loaders/events";
import { getVisibleEvents } from "@/lib/events/visible";
import { isGeoPrecise } from "@/lib/events/geo-confidence";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getCachedLiveEvents } from "@/lib/integrations/ical-live";
import { fetchTicketmasterMusic, fetchTicketmasterSports } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { collapseRecurringEvents } from "@/lib/events/normalize";
import AppMapClient, { type CivicPin, type EventPin } from "@/components/map/AppMapClient";
import MapIntentChips from "@/components/map/MapIntentChips";
import MapTimeChips, { type TimeMode } from "@/components/map/MapTimeChips";
import MapModeToggle from "@/components/map/MapModeToggle";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import PageBloom from "@/components/ui/PageBloom";
import CLIENT_PLACES_RAW from "@/data/places-client.json" with { type: "json" };
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isUtilityEvent } from "@/lib/event-kind";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

/**
 * Slim the SSR payload for /browse before it ships to the client.
 *
 * /browse renders ~1,700 places into the initial HTML. decoratePlace
 * returns the full PlaceCardData; that's overkill for the map +
 * in-view drawer surfaces, and the size matters — every place is
 * stamped into HTML times the place count.
 *
 * Fields stripped here:
 *   - google_photos      (5.7 MB by itself — only used by detail page
 *                         gallery and PlaceSheet's multi-photo deck,
 *                         which has on-demand fallback)
 *   - description         (long; only the detail page renders it)
 *   - review_snippet      (~120 chars × 1,700 ≈ 200 KB; detail-only)
 *   - review_author       (rendered alongside review_snippet)
 *   - google_hours        (array of 7 weekday strings; detail-only)
 *   - hours               (curated weekly schedule object; detail-only,
 *                         open_status is already pre-computed)
 *   - amenities           (array; rendered by detail page only)
 *
 * KEPT for the drawer's PlaceCard:
 *   - google_photo_url, open_status, distance_m fields, name, slug,
 *     category, geom, address, city, phone, website, source,
 *     google_rating, google_rating_count, price_band, short_blurb,
 *     last_verified_at, is_verified, is_operational, municipality
 *
 * The detail page (/places/[slug]) loads its own full data via
 * getPlaceBySlug, so nothing the stripped fields power is lost — they
 * just stop riding along on the map's HTML.
 */
const OPEN_PLACES = publicPlaces().map((p) => {
  const decorated = decoratePlace(p);
  const {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    google_photos: _google_photos,
    description: _description,
    review_snippet: _review_snippet,
    review_author: _review_author,
    google_hours: _google_hours,
    hours: _hours,
    amenities: _amenities,
    /* eslint-enable @typescript-eslint/no-unused-vars */
    ...slim
  } = decorated;
  return slim;
});

export const metadata: Metadata = {
  alternates: { canonical: "/map" },
  title: "Map · Frederick County",
  description:
    "The full pannable map of Frederick County. Filter by what you're doing. Coffee, food, wineries, breweries, outdoors, family, arts, civic.",
  openGraph: { title: "Map · Frederick County", description:
    "The full pannable map of Frederick County. Filter by what you're doing. Coffee, food, wineries, breweries, outdoors, family, arts, civic." },
};

export const revalidate = 300;
// /map fans out to ~10 external APIs (Ticketmaster, Bandsintown, Chart
// traffic, FixIt 311, Mapillary, transit/trail/boundary GIS, USGS).
// Give the render headroom over the platform default so a cold cache
// doesn't 503 — but the real protection is withTimeout() below, which
// stops any single slow upstream from blocking the whole page.
export const maxDuration = 30;

/**
 * Resolve to `fallback` if `p` rejects OR doesn't settle within `ms`.
 *
 * The page's loaders already `.catch(() => [])`, which handles an
 * upstream that ERRORS — but not one that just HANGS. A hanging fetch
 * (no error, no response) blocks Promise.all until the serverless
 * function times out, which is the /map 503 in production. Racing every
 * upstream against a timer means the worst case is a missing layer, not
 * a dead page.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(p).catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * /map — the map IS the page.
 *
 * A user who taps "Map" expects a map, not a directory. The map paints
 * full-bleed under the chrome with the intent chip strip pinned to the
 * top so filtering is one tap away. The synced "in view" list lives in
 * the bottom drawer (peek by default). Discover-style intent depth is
 * still reachable via the chips — colored, iconned, and recognizable.
 */
/**
 * Decide which event-time window the map shows. The brief's "time is
 * a first-class dimension" rule: every event surface gets a temporal
 * lens. Returns a predicate so the seed loop stays a single pass.
 *
 * Modes:
 *   - "now":     live right now (start ≤ now ≤ end) OR starting in the
 *                next 90 minutes
 *   - "tonight": starting between now (clamped to today 16:00 ET) and
 *                tomorrow 02:30 ET — so "tonight" still means "tonight"
 *                at 11pm, and not "yesterday"
 *   - "weekend": Friday 17:00 ET → Monday 00:00 ET of the next weekend
 *   - "all":     next 7 days, capped at 80 by the loop below
 */
function eventTimePredicate(
  mode: TimeMode,
  now: Date,
): (startsAt: string, endsAt?: string) => boolean {
  const nowMs = now.getTime();
  if (mode === "now") {
    const horizon = nowMs + 90 * 60_000;
    return (s, e) => {
      const sMs = Date.parse(s);
      const eMs = e ? Date.parse(e) : sMs;
      if (!Number.isFinite(sMs)) return false;
      // Live now OR starting in the next 90 min
      return (sMs <= nowMs && eMs >= nowMs) || (sMs >= nowMs && sMs <= horizon);
    };
  }
  if (mode === "tonight") {
    // Anchor "tonight" to America/New_York WALL TIME so it matches /today
    // and /events on a UTC (Vercel) server. 4:00 PM ET today → 2:30 AM ET
    // tomorrow. easternWallToUtcISO converts to the correct UTC instant
    // (DST-aware); Date.UTC inside it normalizes the day+1 overflow.
    const { year, month, day } = easternParts(now);
    const start = Math.max(nowMs, Date.parse(easternWallToUtcISO(year, month, day, 16, 0)));
    const end = Date.parse(easternWallToUtcISO(year, month, day + 1, 2, 30));
    return (s) => {
      const sMs = Date.parse(s);
      return Number.isFinite(sMs) && sMs >= start && sMs <= end;
    };
  }
  if (mode === "weekend") {
    // Friday 5 PM ET → Monday 12:00 AM ET, in Eastern wall time.
    const { year, month, day, weekday } = easternParts(now);
    const daysToFri = (5 - weekday + 7) % 7;
    const fMs = Date.parse(easternWallToUtcISO(year, month, day + daysToFri, 17, 0));
    const mMs = Date.parse(easternWallToUtcISO(year, month, day + daysToFri + 3, 0, 0));
    return (s) => {
      const sMs = Date.parse(s);
      return Number.isFinite(sMs) && sMs >= fMs && sMs <= mMs;
    };
  }
  // "all" — next 7 days. The cap is applied in the caller's loop.
  const horizon = nowMs + 7 * 24 * 3_600_000;
  return (s) => {
    const sMs = Date.parse(s);
    return Number.isFinite(sMs) && sMs >= nowMs && sMs <= horizon;
  };
}

function isTimeMode(s: string | undefined): s is TimeMode {
  return s === "now" || s === "tonight" || s === "weekend" || s === "all";
}

/**
 * The deduped, sorted upcoming-events set the map shares between its
 * browse and radius branches: curated seed events unioned with the live
 * feeds (DFP iCal, Ticketmaster music + sports, Bandsintown), civic
 * meetings stripped, recurring occurrences collapsed. Every feed fails
 * soft, and each loader caches via its own revalidate, so the cold-path
 * cost stays bounded under ISR. One source of truth so the two branches
 * can never drift on what "upcoming events" means.
 */
async function loadUpcomingEvents(now: Date): Promise<EventWithMeta[]> {
  // Each feed is timeout-guarded (not just .catch'd) so a slow upstream
  // can't hang the render — the radius branch (the DEFAULT /map view)
  // awaits this, so an unbounded hang here is a default-page 503.
  const [liveEventsRaw, tmMusic, tmSports, bitEvents] = await Promise.all([
    withTimeout(getCachedLiveEvents(60).then((r) => r.events), 5000, [] as Awaited<ReturnType<typeof getCachedLiveEvents>>["events"]),
    withTimeout(fetchTicketmasterMusic(), 5000, []),
    withTimeout(fetchTicketmasterSports(), 5000, []),
    withTimeout(fetchBandsintownForArtists([]), 5000, []),
  ]);
  const curatedWeek = allUpcoming(now, 200);
  const liveCards = dedupeLiveAgainstCurated(
    collapseRecurringEvents(
      [...liveEventsRaw, ...tmMusic, ...tmSports, ...bitEvents]
        .map(liveToCardEvent)
        .filter((e) => !isCivicEvent(e)),
    ),
    curatedWeek,
  );
  const bySlug = new Map<string, EventWithMeta>();
  for (const e of [...curatedWeek, ...liveCards]) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  }
  return [...bySlug.values()].sort(
    (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
  );
}

// Slim places projection used to de-dupe amenities (same shape the
// /radius route used to derive). Inlined here so the radius branch
// can compute its amenity set without dragging the full Place loader
// into the SSR payload — we only need name/category/geom for dedup.
const CLIENT_PLACES_FOR_DEDUPE = (
  CLIENT_PLACES_RAW as unknown as Array<{
    name: string;
    category: string;
    geom: { lng: number; lat: number };
  }>
).map((p) => ({ name: p.name, category: p.category, geom: p.geom }));

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{
    intent?: string;
    sub?: string;
    t?: string;
    open?: string;
    /** `browse` (DEFAULT — the clean full-map surface: intent + time
     *  chips, no isochrone, no bottom sheet) or `radius` (the guided
     *  "Nearby" tool: isochrone + the within-reach control sheet). The
     *  May 2026 brand review made radius the default ("soul of the
     *  map"), but the owner's repeated direction is the map IS the page:
     *  land clean, no bottom panel narrating places. Radius stays a
     *  deliberate opt-in via the "Nearby" pill. When unset, browse. */
    mode?: string;
  }>;
}) {
  // Peek the mode param BEFORE doing the heavy browse-mode data
  // loads. The radius branch only needs amenities — no need to
  // fetch traffic / fixit / mapillary / trails / transit lines /
  // event feeds when we're going to render RadiusBuilder.
  const earlyParams = await searchParams;
  const mode: "radius" | "browse" =
    earlyParams.mode === "radius" ? "radius" : "browse";

  if (mode === "radius") {
    // Radius mode: minimal SSR payload (just amenities) — RadiusBuilder
    // is a client component that reads clientPlaces() itself. Result:
    // the radius surface ships ~⅒ the HTML the browse surface does.
    const radiusAmenities = dedupeAmenities(
      allAmenities(),
      CLIENT_PLACES_FOR_DEDUPE,
    );
    // Upcoming events with coordinates, slimmed to just what the reach
    // view needs (no SSR bloat). RadiusBuilder filters these to the
    // chosen reach. Same shared loader as browse, so the event set is
    // identical across modes; ISR caching bounds the cold-path cost.
    const radiusNow = new Date();
    const radiusEvents = getVisibleEvents(
      await withTimeout(loadUpcomingEvents(radiusNow), 8000, [] as EventWithMeta[]),
      radiusNow,
    )
      // Belt-and-suspenders against past events leaking into "within reach":
      // getVisibleEvents (above) is the shared rule, applied here so a merged
      // live-feed row can't slip a finished event past the curated
      // allUpcoming() filter (the audit saw a May event under radius).
      // Draw-only on the map: civic meetings/hearings aren't map answers
      // (shared event-kind rule — consistent with Today and /events).
      .filter((e) => !isUtilityEvent(e))
      // Geo confidence (audit #2 P1): "within reach" is a reachability
      // promise, so ONLY addressable events qualify. A feed event pinned to
      // the "Frederick" centroid has no honest distance — including it made
      // the map claim "113 ft away" for a county-wide event. Drop the
      // area-level/unknown ones here rather than render a false distance.
      .filter(isGeoPrecise)
      .filter((e) => Number.isFinite(e.geom?.lng) && Number.isFinite(e.geom?.lat))
      .slice(0, 120)
      .map((e) => ({
        slug: e.slug,
        title: e.title,
        startsAt: e.starts_at,
        venueName: e.venue_name ?? null,
        lng: e.geom.lng,
        lat: e.geom.lat,
        category: e.category,
      }));
    return (
      <div className="relative mx-auto max-w-screen-md space-y-3 lg:max-w-screen-lg">
        <h1 className="sr-only">Frederick County map: places within reach</h1>
        <PageBloom variant="cool" />
        {/* Mode toggle is handed to RadiusBuilder, which renders it in two
            places: a modest floating copy over the collapsed map (always
            visible, so "Whole county" is reachable without expanding) and
            inside the sheet body for the expanded state. Clear of the map's
            camera controls and the locate button. */}
        <RadiusBuilder
          amenities={radiusAmenities}
          events={radiusEvents}
          modeToggle={<MapModeToggle mode="radius" />}
        />
      </div>
    );
  }

  // Browse mode — stream it. The shell (the two thin mode strips)
  // paints immediately; the heavy ~10-feed data load + the map render
  // stream in via Suspense, so the page no longer blocks first paint on
  // the slowest upstream AND the Mapbox JS downloads during that fetch.
  return (
    <div className="relative -mx-4 -mt-4 lg:ml-0">
      <h1 className="sr-only">Frederick County map</h1>
      <Suspense
        fallback={
          <div
            className="animate-pulse"
            style={{ height: BROWSE_MAP_HEIGHT, background: "var(--app-bg-sunken)" }}
            aria-busy="true"
            aria-label="Loading map"
          />
        }
      >
        <BrowseMapArea params={earlyParams} />
      </Suspense>
      {/* The mode toggle floats over the map as a control near the bottom
          edge. Lifted ABOVE the floating bottom-nav reserve (84px) so on a
          narrow phone the centered toggle and the centered nav pill never
          overlap (they collided at +16px). lg pins it to the right gutter. */}
      <div
        className="pointer-events-none absolute inset-x-0 z-[var(--z-map-control)] flex justify-center px-3 lg:justify-end lg:px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--app-bottomnav-reserve))" }}
      >
        <div className="pointer-events-auto">
          <MapModeToggle mode="browse" />
        </div>
      </div>
    </div>
  );
}

// Reserve the floating bottom nav (~84px incl. its lift) + bottom
// safe-area so the map never slides under the nav (audit: "sticky bottom
// nav overlays content"). The mode toggle now FLOATS over the map (a map
// control above the peek sheet) instead of sitting in flow below it, so
// the ~48px strip that used to be reserved for that in-flow pill is
// reclaimed — the map extends down to meet the nav's breathing room
// instead of leaving a dead cream band ("the bottom UI doesn't look fixed").
// One source of truth (globals.css :root) so the page + its loading skeleton
// can never drift (that drift caused a visible canvas jump on tab-in).
const BROWSE_MAP_HEIGHT = "var(--app-browse-map-height)";

/** The heavy half of browse mode — ~10 upstream feeds + the map render.
 *  Split into its own async component so the page shell can stream
 *  while this resolves (Suspense boundary in MapPage above). */
async function BrowseMapArea({
  params,
}: {
  params: { intent?: string; sub?: string; t?: string; open?: string };
}) {
  const { intent: intentParam, sub: subParam, t: tParam, open: openParam } = params;
  const now = new Date();
  const [
    incidents,
    fixit,
    mapillaryTrash,
    trailLines,
    transitLines,
    municipalBoundaries,
    countyBoundary,
    waterSites,
    allWeek,
  ] = await Promise.all([
    // Timeout-guarded (not just .catch'd): a slow upstream degrades to a
    // missing layer instead of hanging the render into a 503.
    withTimeout(getChartIncidentsFrederick(), 6000, []),
    withTimeout(getFixItIssues(30), 6000, []),
    withTimeout(fetchMapillaryTrash(), 6000, []),
    withTimeout(getFrederickTrailShapes(), 6000, EMPTY_FC),
    withTimeout(getFrederickTransitRouteShapes(), 6000, EMPTY_FC),
    // County GIS municipal boundary polygons — quiet always-on map
    // outline. Fail-soft to empty so the county server never blocks.
    withTimeout(getMunicipalBoundaries(), 6000, EMPTY_FC),
    // County boundary outline — committed static GeoJSON, the quiet
    // always-on county edge (6.1). Fail-soft to empty.
    withTimeout(getCountyBoundary(), 6000, EMPTY_FC),
    // USGS river gauges — surfaced as a map layer (kind="river_gauge")
    // so the Rivers & creeks dataset isn't trapped on /rivers alone.
    withTimeout(getFrederickWaterSites(), 6000, []),
    // Upcoming events (curated seed + live feeds), deduped + sorted.
    // Shared with the radius branch via loadUpcomingEvents so the two
    // can never drift on what "upcoming" means.
    withTimeout(loadUpcomingEvents(now), 8000, [] as EventWithMeta[]),
  ]);
  const civic: CivicPin[] = [
    ...incidents
      .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .map((i) => ({
        kind: "traffic" as const,
        lng: i.lng,
        lat: i.lat,
        label: `${i.road}: ${i.type}`,
      })),
    ...fixit
      .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .map((i) => ({
        kind: "issue" as const,
        lng: i.lng,
        lat: i.lat,
        label: i.summary,
      })),
  ];

  // Hydrate USGS gauges into Amenity shape so they ride the existing
  // amenity layer system (Gauges chip in AMENITY_GROUPS). USGS site
  // ids prefix with "usgs:" so they never collide with OSM-derived
  // amenity ids. Failed fetches fall back to empty — the toggle
  // simply renders zero points.
  const riverGaugeAmenities = waterSites.map((s) => ({
    id: `usgs:${s.id}`,
    kind: "river_gauge" as const,
    name: s.river ? `${s.river} gauge` : "USGS gauge",
    detail: s.name,
    municipality: s.municipality,
    lng: s.lng,
    lat: s.lat,
  }));

  const amenities = dedupeAmenities(
    [...allAmenities(), ...riverGaugeAmenities],
    OPEN_PLACES.map((p) => ({ name: p.name, category: p.category, geom: p.geom })),
  );

  const intent =
    intentParam && intentParam in INTENT_BY_KEY
      ? INTENT_BY_KEY[intentParam as IntentKey]
      : null;
  // First-tier filter: top intent.
  const intentPlaces = intent ? OPEN_PLACES.filter(intent.match) : OPEN_PLACES;
  // Sub-counts (parent-scoped) — computed BEFORE the sub-filter is
  // applied so each sub-chip shows the population reachable from the
  // current parent state. Users see "Pizza · 12" and don't tap into
  // an empty filter. Empty when no intent active or no subIntents
  // defined; sub-strip simply doesn't render in that case.
  const subCounts: Record<string, number> = {};
  if (intent?.subIntents) {
    for (const s of intent.subIntents) {
      subCounts[s.key] = intentPlaces.filter(s.match).length;
    }
  }
  // Second-tier filter: sub-intent, scoped to the active parent.
  // Ignored when the parent intent doesn't define this sub key — so
  // a stale ?sub= param from a parent switch doesn't quietly wipe the
  // result set.
  const activeSub = intent?.subIntents?.find((s) => s.key === subParam);
  const subFiltered = activeSub
    ? intentPlaces.filter(activeSub.match)
    : intentPlaces;
  // Third-tier filter: ?open=now collapses the pool to places that are
  // verifiably open right this minute (open or closing-soon). The
  // brief's "time as a first-class dimension" applied to places —
  // Google's map answers "is it open?" one place at a time; this
  // answers it across the whole viewport. The count next to the chip
  // is computed AFTER intent/sub filtering so it reflects what the
  // user is actually browsing.
  const openNow = openParam === "now";
  const openNowCount = subFiltered.filter((p) => isOpenNow(p.open_status)).length;
  const places = openNow
    ? subFiltered.filter((p) => isOpenNow(p.open_status))
    : subFiltered;

  // Events as map pins, scoped to the active temporal window. The
  // brief's "what's happening now / tonight / this weekend" filter
  // lives in the ?t= search param. `allWeek` (curated + live feeds,
  // deduped + sorted) comes from loadUpcomingEvents in the Promise.all
  // above, shared with the radius branch.
  // Pre-compute per-mode counts so the chip strip can show "Tonight · 3"
  // without forcing a click into an empty map.
  // Draw-only base for BOTH the chip counts and the rendered pins, so a
  // "Tonight · 3" count can never include a civic hearing the map won't
  // plot (shared event-kind rule).
  const drawWeek = allWeek.filter((e) => !isUtilityEvent(e));
  const counts: Partial<Record<TimeMode, number>> = {};
  for (const mode of ["now", "tonight", "weekend", "all"] as const) {
    const pred = eventTimePredicate(mode, now);
    counts[mode] = drawWeek.filter((e) => pred(e.starts_at, e.ends_at)).length;
  }
  // Default time mode: was hard-wired to "tonight" which produced an
  // empty event layer most days/hours. Now picks the first populated
  // window in priority order Now → Tonight → Weekend → Upcoming. The
  // user can still tap any chip; this just stops the map from opening
  // with zero event pins when there are events one chip over.
  function pickDefaultTimeMode(): TimeMode {
    if ((counts.now ?? 0) > 0) return "now";
    if ((counts.tonight ?? 0) > 0) return "tonight";
    if ((counts.weekend ?? 0) > 0) return "weekend";
    return "all";
  }
  const timeMode: TimeMode = isTimeMode(tParam) ? tParam : pickDefaultTimeMode();

  const matchTime = eventTimePredicate(timeMode, now);
  const inWindow = drawWeek.filter((e) => matchTime(e.starts_at, e.ends_at));
  const seenCells = new Set<string>();
  const events: EventPin[] = [];
  for (const e of inWindow) {
    if (!Number.isFinite(e.geom?.lng) || !Number.isFinite(e.geom?.lat)) continue;
    const cell = `${e.geom.lat.toFixed(4)}:${e.geom.lng.toFixed(4)}`;
    if (seenCells.has(cell)) continue;
    seenCells.add(cell);
    events.push({
      slug: e.slug,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      venue_name: e.venue_name,
      lng: e.geom.lng,
      lat: e.geom.lat,
      category: e.category,
      category_color: CATEGORY_BY_SLUG[e.category]?.color,
      hero_image: e.hero_image,
    });
    if (events.length >= 80) break;
  }

  return (
    <div className="relative" style={{ height: BROWSE_MAP_HEIGHT }}>
        <AppMapClient
          places={places}
          civic={civic}
          extraAmenities={mapillaryTrash}
          amenities={amenities}
          trailLines={trailLines}
          transitLines={transitLines}
          municipalBoundaries={municipalBoundaries}
          countyBoundary={countyBoundary}
          events={events}
          fullBleed
          // Arriving via a category tile (?intent=…): center on the
          // user's known location and measure from there.
          recenterToKnownLocation={Boolean(intent)}
          // Show the county by default — never an empty map. The curated
          // places ride a CLUSTERED source, so "all ~1,700" reads as a
          // handful of tidy numbered bubbles that answer "what's here?" at a
          // glance and break apart as you zoom; the chips then REFINE rather
          // than gate. (Was pinpoint-first: blank until you tapped a chip,
          // which assumed you didn't want to see anything yet.)
          pinpointDefault={false}
        >
          {/* In-context filter UI — passed as children so it overlays
              only the map column, never the desktop list pane. */}
          <MapIntentChips
            active={intent?.key}
            activeCount={intent ? places.length : undefined}
            activeSub={activeSub?.key}
            subCounts={subCounts}
            openNow={openNow}
          >
            <MapTimeChips
              active={timeMode}
              intent={intent?.key}
              sub={activeSub?.key}
              openNow={openNow}
              openNowCount={openNowCount}
            />
          </MapIntentChips>
        </AppMapClient>
      </div>
  );
}
