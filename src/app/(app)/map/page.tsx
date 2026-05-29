import type { Metadata } from "next";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { isOpenNow } from "@/lib/hours";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { getMunicipalBoundaries } from "@/lib/integrations/fcGis";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import { allUpcoming, dedupeLiveAgainstCurated, isCivicEvent, type EventWithMeta } from "@/lib/loaders/events";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { fetchTicketmasterMusic, fetchTicketmasterSports } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { collapseRecurringEvents } from "@/lib/events/normalize";
import AppMapClient, { type CivicPin, type EventPin } from "@/components/map/AppMapClient";
import MapIntentChips from "@/components/map/MapIntentChips";
import MapTimeChips, { type TimeMode } from "@/components/map/MapTimeChips";
import MapModeToggle from "@/components/map/MapModeToggle";
import MapModes from "@/components/map/MapModes";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import PageBloom from "@/components/ui/PageBloom";
import CLIENT_PLACES_RAW from "@/data/places-client.json" with { type: "json" };
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";
import { CATEGORY_BY_SLUG } from "@/data/categories";

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
  title: "Map · Frederick County",
  description:
    "The full panable map of Frederick County. Filter by what you're doing. Coffee, food, wineries, breweries, outdoors, family, arts, civic.",
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
    // Anchor "tonight" in Eastern time so the same definition holds
    // for a Vercel UTC server and a Frederick user. 16:00 ET = 21:00
    // UTC (or 20:00 UTC during EDT — close enough for a coarse map
    // filter; the seed events themselves are precise.)
    const today = new Date(now);
    today.setHours(16, 0, 0, 0);
    const start = Math.max(nowMs, today.getTime());
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 30, 0, 0);
    const end = tomorrow.getTime();
    return (s) => {
      const sMs = Date.parse(s);
      return Number.isFinite(sMs) && sMs >= start && sMs <= end;
    };
  }
  if (mode === "weekend") {
    const dow = now.getDay();
    const friday = new Date(now);
    friday.setDate(friday.getDate() + ((5 - dow + 7) % 7));
    friday.setHours(17, 0, 0, 0);
    const monday = new Date(friday);
    monday.setDate(monday.getDate() + 3);
    monday.setHours(0, 0, 0, 0);
    const fMs = friday.getTime();
    const mMs = monday.getTime();
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
    withTimeout(getLiveEvents(60).then((r) => r.events), 5000, [] as Awaited<ReturnType<typeof getLiveEvents>>["events"]),
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
    /** `radius` (default — Radius-first map per the May 2026 brand
     *  review) or `browse` (classic intent + time chips, no
     *  isochrone). When unset, defaults to radius. */
    mode?: string;
  }>;
}) {
  // Peek the mode param BEFORE doing the heavy browse-mode data
  // loads. The radius branch only needs amenities — no need to
  // fetch traffic / fixit / mapillary / trails / transit lines /
  // event feeds when we're going to render RadiusBuilder.
  const earlyParams = await searchParams;
  const mode: "radius" | "browse" =
    earlyParams.mode === "browse" ? "browse" : "radius";

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
    const radiusEvents = (await withTimeout(loadUpcomingEvents(new Date()), 8000, [] as EventWithMeta[]))
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
      <div className="relative space-y-3">
        <PageBloom variant="cool" />
        {/* Mode toggle is rendered INSIDE RadiusBuilder, in the row
            immediately below the map — clear of the map's own camera
            controls and the floating stats ribbon, and where the user
            expects a UI control to live. */}
        <RadiusBuilder
          amenities={radiusAmenities}
          events={radiusEvents}
          modeToggle={<MapModeToggle mode="radius" />}
        />
      </div>
    );
  }

  // Browse mode — the original /map experience. The rest of this
  // function is the pre-existing data-fetch + render pipeline. We
  // already destructured the params for the mode peek above, so we
  // reuse `earlyParams` here instead of awaiting searchParams again.
  const { intent: intentParam, sub: subParam, t: tParam, open: openParam } =
    earlyParams;
  const now = new Date();
  const [
    incidents,
    fixit,
    mapillaryTrash,
    trailLines,
    transitLines,
    municipalBoundaries,
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
  const counts: Partial<Record<TimeMode, number>> = {};
  for (const mode of ["now", "tonight", "weekend", "all"] as const) {
    const pred = eventTimePredicate(mode, now);
    counts[mode] = allWeek.filter((e) => pred(e.starts_at, e.ends_at)).length;
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
  const inWindow = allWeek.filter((e) => matchTime(e.starts_at, e.ends_at));
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
    <div className="-mx-4 -mt-4">
      {/* MapModes preset shelf — inline ABOVE the map (no longer
          floating). Putting it in normal flow gives clear separation
          from TopBar so the chips can never sit under the search bar,
          which is what was happening when MapModes floated absolute
          at top-2 of the map div (the safe-area math was double-
          counted on devices with a notch). */}
      <div className="px-3 py-2 sm:px-4">
        <MapModes
          params={{ mode: "browse", open: openParam, intent: intentParam }}
        />
      </div>
      <div
        className="relative"
        style={{
          // 100dvh minus TopBar (56) minus the MapModes strip (~48)
          // minus the bottom toggle strip (~48) minus the iOS safe
          // area at top. Both inline strips use py-2 = 16px padding
          // with ~32px chip height = ~48px each.
          height:
            "calc(100dvh - 56px - 48px - 48px - env(safe-area-inset-top, 0px))",
        }}
      >
        {/* MapIntentChips still floats over the map — it's the
            in-context filter UI; users tap chips to narrow what's
            visible. The active-intent banner sits at the top of this
            stack; the chips strip and the optional MapTimeChips
            children sit below it in the same space-y-2 flow. */}
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
            counts={counts}
            openNow={openNow}
            openNowCount={openNowCount}
          />
        </MapIntentChips>
        <AppMapClient
          places={places}
          civic={civic}
          extraAmenities={mapillaryTrash}
          amenities={amenities}
          trailLines={trailLines}
          transitLines={transitLines}
          municipalBoundaries={municipalBoundaries}
          events={events}
          fullBleed
          // Arriving via a category tile (?intent=…): center on the
          // user's known location, measure/sort the list from there,
          // and open the results drawer so the filtered list is the
          // first thing they see.
          autoOpenList={Boolean(intent)}
          recenterToKnownLocation={Boolean(intent)}
          // Pinpoint-first: with no intent filter, open the map CLEAN and
          // let the user add what they want (vs. dumping all ~1,700 pins).
          pinpointDefault={!intent}
        />
      </div>
      {/* Mode toggle BELOW the map in its own right-aligned strip,
          mirroring the MapModes strip above. Toggle lives in the
          same spot across both Radius and Browse so the affordance
          is learnable. */}
      <div className="flex justify-end px-3 py-2 sm:px-4">
        <MapModeToggle mode="browse" />
      </div>
    </div>
  );
}
