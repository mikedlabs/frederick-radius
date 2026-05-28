import type { Metadata } from "next";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import { allUpcoming, dedupeLiveAgainstCurated, isCivicEvent } from "@/lib/loaders/events";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { fetchTicketmasterMusic, fetchTicketmasterSports } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
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
    return (
      <div className="relative space-y-3">
        <PageBloom variant="cool" />
        {/* Mode toggle floats above the map at top-right so the user
            can always flip back to Browse without leaving the page. */}
        {/* Mode toggle floats at top-LEFT so it stays clear of the
            RadiusMap's right-side camera controls (Fit radius / Show
            county) and the top-center "current center" pill. */}
        <div className="absolute left-3 top-3 z-40 sm:left-4 sm:top-4">
          <MapModeToggle mode="radius" />
        </div>
        <RadiusBuilder amenities={radiusAmenities} />
      </div>
    );
  }

  // Browse mode — the original /map experience. The rest of this
  // function is the pre-existing data-fetch + render pipeline. We
  // already destructured the params for the mode peek above, so we
  // reuse `earlyParams` here instead of awaiting searchParams again.
  const { intent: intentParam, sub: subParam, t: tParam, open: openParam } =
    earlyParams;
  const [
    incidents,
    fixit,
    mapillaryTrash,
    trailLines,
    transitLines,
    liveEventsRaw,
    tmMusic,
    tmSports,
    bitEvents,
    waterSites,
  ] = await Promise.all([
    getChartIncidentsFrederick().catch(() => []),
    getFixItIssues(30).catch(() => []),
    fetchMapillaryTrash().catch(() => []),
    getFrederickTrailShapes().catch(() => EMPTY_FC),
    getFrederickTransitRouteShapes().catch(() => EMPTY_FC),
    // Live event feeds — same set /events uses. Pre-fix the map only
    // pulled `allUpcoming` (curated seed events.ts), so the event
    // layer showed 2 pins when /events listed dozens. Joining the
    // live feeds here brings the map to parity. All fail-soft.
    getLiveEvents(60).then((r) => r.events).catch(() => []),
    fetchTicketmasterMusic().catch(() => []),
    fetchTicketmasterSports().catch(() => []),
    fetchBandsintownForArtists([]).catch(() => []),
    // USGS river gauges — surfaced as a map layer (kind="river_gauge")
    // so the Rivers & creeks dataset isn't trapped on /rivers alone.
    // Gauges report every ~15 min upstream; we cache for 30 min via
    // the loader's revalidate. Light payload — no per-site history.
    getFrederickWaterSites().catch(() => []),
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
  const openNowCount = subFiltered.filter(
    (p) => p.open_status.state === "open" || p.open_status.state === "closing-soon",
  ).length;
  const places = openNow
    ? subFiltered.filter(
        (p) => p.open_status.state === "open" || p.open_status.state === "closing-soon",
      )
    : subFiltered;

  // Events as map pins, scoped to the active temporal window. The
  // brief's "what's happening now / tonight / this weekend" filter
  // lives in the ?t= search param.
  const now = new Date();
  // Combine curated seed events with live feeds (DFP iCal, Ticketmaster
  // music + sports, Bandsintown) — same union /events uses. Dedupe by
  // slug so a curated entry doesn't double up with a live duplicate;
  // strip civic-meeting rows the same way /events does.
  const curatedWeek = allUpcoming(now, 200);
  const liveCards = dedupeLiveAgainstCurated(
    [...liveEventsRaw, ...tmMusic, ...tmSports, ...bitEvents]
      .map(liveToCardEvent)
      .filter((e) => !isCivicEvent(e)),
    curatedWeek,
  );
  const eventsBySlug = new Map<string, (typeof curatedWeek)[number]>();
  for (const e of [...curatedWeek, ...liveCards]) {
    if (!eventsBySlug.has(e.slug)) eventsBySlug.set(e.slug, e);
  }
  const allWeek = [...eventsBySlug.values()].sort(
    (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
  );
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
    <div
      className="-mx-4 -mt-4 relative"
      style={{
        marginBottom: "calc(-6rem - env(safe-area-inset-bottom, 0px))",
        height: "calc(100dvh - 56px - env(safe-area-inset-top, 0px))",
      }}
    >
      {/* MapIntentChips owns the absolute positioning at the top of
          the map; MapTimeChips renders as a child so the two strips
          stack inside the same flow container. Previously they were
          siblings with independent `top:` offsets, which overlapped
          the moment the active-intent banner pushed the intent strip
          down. */}
      {/* Mode toggle — floats over the map so the user can flip
          back to Radius mode without leaving the page. Positioned
          at top-LEFT so it clears Mapbox's compass/scale controls
          and any future right-side overlays. */}
      <div className="absolute left-3 top-3 z-40 sm:left-4 sm:top-4">
        <MapModeToggle mode="browse" />
      </div>
      {/* Map Modes — preset "decision surface" deep links. Sits
          BELOW the mode toggle and ABOVE MapIntentChips so the
          hierarchy reads: "Radius vs Browse" (toggle) → "What kind
          of browse?" (preset) → "What category?" (intent chips).
          Per the May 2026 review: most maps show everything;
          this app should show the RIGHT layer for the moment. */}
      <div className="pointer-events-none absolute inset-x-0 top-14 z-30 px-3 sm:top-16 sm:px-4">
        <MapModes
          params={{ mode: "browse", open: openParam, intent: intentParam }}
        />
      </div>
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
        events={events}
        fullBleed
      />
    </div>
  );
}
