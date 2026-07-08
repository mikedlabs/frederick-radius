import type { Metadata } from "next";
import { Suspense } from "react";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { getMunicipalBoundaries, getCountyBoundary } from "@/lib/integrations/fcGis";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import { getFieldAmenities } from "@/lib/loaders/fieldAmenities";
import { getCommunityReports } from "@/lib/loaders/communityReports";
import { REPORT_CATEGORY_BY_KEY } from "@/lib/reports/categories";
import type { OsmPlace } from "@/lib/integrations/overpass";
import type { EventWithMeta } from "@/lib/loaders/events";
import { getVisibleEvents } from "@/lib/events/visible";
import { isGeoPrecise } from "@/lib/events/geo-confidence";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getEvChargingStations, evDetailLine } from "@/lib/integrations/evCharging";
import { getHistoricCemeteries } from "@/lib/integrations/fcCemeteries";
import { unstable_cache } from "next/cache";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import type { CivicPin, EventPin } from "@/components/map/AppMapClient";
import type { MapPinPlace } from "@/components/map/types";
import BrowseMapClient from "@/components/map/BrowseMapClient";
import MapModeGate from "@/components/map/MapModeGate";
import MapModeToggle from "@/components/map/MapModeToggle";
import MapWarmup from "@/components/map/MapWarmup";
import RadiusBuilder from "@/components/radius/RadiusBuilder";
import PageBloom from "@/components/ui/PageBloom";
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
/** Slim decorated places, memoized per 5-minute bucket (was a module-scope
 *  const). Module scope froze `now` at lambda init: decoratePlace defaults
 *  now = new Date() evaluated ONCE, so a warm serverless instance served
 *  hours-old open_status — the "?open=now" filter, openNowCount chip, and
 *  "closing soon" badges all computed from that dead clock (the baked
 *  closesAt values were visible in the flight payload). A plain in-lambda
 *  memo (NOT unstable_cache: ~1,700 records would flirt with its 2MB
 *  serialization ceiling) re-decorates at most once per bucket per instance
 *  and also moves the ~1,700 decoratePlace calls off cold-start module init
 *  onto the first request. Same 5-minute bucket trick as
 *  cachedUpcomingEvents below. */
let openPlacesMemo: { bucket: number; places: ReturnType<typeof slimPlace>[] } | null = null;
function openPlaces(now: Date): ReturnType<typeof slimPlace>[] {
  const bucket = Math.floor(now.getTime() / 300_000);
  if (openPlacesMemo?.bucket === bucket) return openPlacesMemo.places;
  const places = publicPlaces().map((p) => slimPlace(p, now));
  openPlacesMemo = { bucket, places };
  return places;
}
function slimPlace(p: Parameters<typeof decoratePlace>[0], now: Date): MapPinPlace {
  const d = decoratePlace(p, undefined, now);
  // WHITELIST, not blacklist. The old strip removed 7 heavy fields and shipped
  // the other ~40 (address, phone, website, blurbs, license, provenance dates,
  // photo URLs...) — ~2.2KB per place x 1,627 places = the 3.58MB flight
  // payload, plus ~138KB of literal "$undefined" tokens for absent keys. Pins,
  // filters, and the dedupe index need exactly the MapPinPlace fields; the
  // sheet hydrates the full record on tap from /api/places/by-slugs (cached,
  // immutable-ish). Undefined values are DROPPED so the flight payload stops
  // paying for keys with no value.
  const pin: MapPinPlace = {
    slug: d.slug,
    name: d.name,
    category: d.category,
    subcategories: d.subcategories,
    geom: d.geom,
    open_status: d.open_status,
    is_verified: d.is_verified,
    field_notes: d.field_notes,
    deal_hook: d.deal_hook,
    source: d.source,
    // google_place_id + feature_score deliberately NOT shipped (~107 KB
    // across 1,627 pins). Their only client read is AppMap's DedupeRecord
    // for the OSM-vs-curated check, where they can never fire: isSamePlace's
    // id-equality branch needs BOTH sides to carry a Google id and OSM
    // records never do. The type keeps them optional so full PlaceCardData
    // records (SavedList, radius) still satisfy MapPinPlace structurally.
    municipality: d.municipality,
    short_blurb: d.short_blurb,
    primary_type: d.primary_type,
  };
  return Object.fromEntries(
    Object.entries(pin).filter(([, v]) => v !== undefined),
  ) as MapPinPlace;
}

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
// Give the (re)validation render headroom over the platform default so a
// cold cache doesn't 503 — but the real protection is withTimeout()
// below, which stops any single slow upstream from blocking the render.
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
 * The deduped, sorted upcoming-events set the map shares between its
 * browse and radius branches: curated seed events unioned with the live
 * feeds (DFP iCal, Ticketmaster music + sports, Bandsintown), civic
 * meetings stripped, recurring occurrences collapsed. Every feed fails
 * soft, and each loader caches via its own revalidate, so the cold-path
 * cost stays bounded under ISR. One source of truth so the two branches
 * can never drift on what "upcoming events" means.
 */
async function loadUpcomingEvents(now: Date): Promise<EventWithMeta[]> {
  // ONE unified event set (CLAUDE.md's own rule: never count events from a
  // different query). This function used to maintain a second, drifted feed
  // union — it omitted SeatGeek, Eventbrite, Visit Frederick, the Keys, and
  // the venue lineups, and called fetchBandsintownForArtists([]) with an
  // EMPTY artist list so Bandsintown contributed literally nothing to the map
  // (data audit: the same soft-drift bug as June's P0-5, reborn on /map).
  // assembleUnifiedEvents is itself unstable_cache-wrapped and kept hot by
  // the warm-events cron, so this is also FASTER on a cold render. The
  // timeout guard stays: a cache-miss assembly still fans out to feeds.
  const { publicEvents } = await withTimeout(
    assembleUnifiedEvents(now),
    8000,
    { unified: [] as EventWithMeta[], publicEvents: [] as EventWithMeta[] },
  );
  return publicEvents;
}

/**
 * Cached wrapper around loadUpcomingEvents (isr-6). Cache the assembled
 * result per 300s bucket (matching cachedAssemble in unifiedEvents.ts),
 * tagged "events" so the ingest crons bust it, and SHA-pinned so a deploy
 * auto-invalidates (the #509 lesson). `now` is rounded to the bucket and
 * rebuilt INSIDE the cached fn — passing the raw Date would make every
 * render a unique key and the cache a no-op. The page still windows the
 * result against the real clock downstream (client-side, in
 * BrowseMapClient), so "tonight/weekend" stay exact.
 */
const cachedUpcomingEvents = unstable_cache(
  (bucket: number) => loadUpcomingEvents(new Date(bucket * 300_000)),
  // v3: the unified assembly now geocodes centroid-grade venue geoms
  // (unified-events-v17) — the cached rows' geom/geo_confidence change.
  ["map-upcoming-events-v3", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 300, tags: ["events"] },
);

function upcomingEventsBucket(now: Date): number {
  return Math.floor(now.getTime() / 300_000);
}

// Slim places projection used to de-dupe amenities (same shape the
// /radius route used to derive). Inlined here so the radius branch
// can compute its amenity set without dragging the full Place loader
// into the SSR payload — we only need name/category/geom for dedup.
//
// Loaded + projected lazily via dynamic import, then memoized.
// places-client.json is ~1.8MB. A static top-level import forced that
// JSON into the module graph so it was parsed on EVERY /map render —
// including the default browse path, which never touches it (browse
// reads publicPlaces()). Only the radius branch below needs it, so we
// defer the whole file behind first use: cold browse instances skip the
// parse + array allocation entirely.
let _clientDedupeProjection:
  | Array<{ name: string; category: string; geom: { lng: number; lat: number } }>
  | null = null;
async function clientDedupeProjection() {
  if (_clientDedupeProjection === null) {
    const raw = (await import("@/data/places-client.json")).default;
    _clientDedupeProjection = (
      raw as unknown as Array<{
        name: string;
        category: string;
        geom: { lng: number; lat: number };
      }>
    ).map((p) => ({ name: p.name, category: p.category, geom: p.geom }));
  }
  return _clientDedupeProjection;
}

/**
 * /map — the map IS the page, and now it's a STATIC (ISR) page.
 *
 * This route used to `await searchParams` to pick browse vs radius mode
 * and to apply the ?intent/?sub/?t/?open/?at/?amenity view — which, in
 * Next 16, opted the whole route out of static rendering. Every request
 * (worst: the first after a deploy) re-ran the ~10-feed fan-out
 * server-side (~8s TTFB cold). Restructured 2026-07:
 *
 *   - ALL data loading is param-independent and happens here at
 *     build/revalidate time (revalidate = 300, feeds kept hot by the
 *     warm cron underneath).
 *   - BOTH mode branches render server-side; MapModeGate (client) picks
 *     one from the live URL. Only the chosen branch mounts.
 *   - The URL-driven browse view (intent/sub/open/t/at/amenity) moved
 *     into BrowseMapClient, which reads useSearchParams — the map was
 *     always a client-only canvas (`ssr: false`), so nothing visual left
 *     the prebuilt HTML except what was never in it.
 *
 * Staleness bounds: open_status and the event week are baked per ISR
 * render (≤300s + the in-flight revalidation window); the event TIME
 * WINDOWS (now/tonight/weekend) are computed against the browser clock,
 * so they can't drift at all.
 */
export default function MapPage() {
  return (
    <>
      {/* Mapbox preconnects live HERE, not in the root layout: the map is
          the only surface that talks to these origins, and eager global
          preconnects competed with the LCP asset on every other route
          (speed audit). React hoists these into <head>. Hoisted above the
          mode gate so they're in the STATIC shell for both modes. */}
      <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
      {/* Warm the mapbox-gl chunk from the static shell, in parallel with
          hydration — both modes render a Mapbox canvas. */}
      <MapWarmup />
      {/* useSearchParams (the mode gate + the browse view state) client-
          renders up to this boundary in a static route, so the prebuilt
          HTML carries the map-shaped skeleton below — which is exactly
          what the dynamic page showed while its data streamed anyway. */}
      <Suspense fallback={<MapShellFallback />}>
        <MapModeGate browse={<BrowseMode />} radius={<RadiusMode />} />
      </Suspense>
    </>
  );
}

/** The prebuilt-HTML placeholder: browse-shaped (browse is the default
 *  and the mode that must be instant); a ?mode=radius arrival sees it
 *  for one hydration beat before RadiusBuilder mounts. */
function MapShellFallback() {
  return (
    <div className="relative -mx-4 -mt-4 lg:ml-0">
      <div
        className="animate-pulse"
        style={{ height: BROWSE_MAP_HEIGHT, background: "var(--app-bg-sunken)" }}
        aria-busy="true"
        aria-label="Loading map"
      />
    </div>
  );
}

/** Radius ("Nearby") mode — no UI entry point (owner call 2026-07-08),
 *  reachable via /map?mode=radius. Minimal payload: RadiusBuilder is a
 *  client component that reads clientPlaces() itself; only amenities +
 *  slim events ship from the server. Rendered at build/revalidate time
 *  like everything else on this page — the loads below are cached +
 *  fail-soft, so keeping the branch warm costs little. */
async function RadiusMode() {
  // Field-collected amenities ride the radius "within reach" set too, so a
  // collected restroom/water/etc. counts toward Nearby, not just browse.
  const radiusField = await withTimeout(getFieldAmenities(), 6000, []);
  const radiusAmenities = dedupeAmenities(
    [...allAmenities(), ...radiusField],
    await clientDedupeProjection(),
  );
  // Upcoming events with coordinates, slimmed to just what the reach
  // view needs (no SSR bloat). RadiusBuilder filters these to the
  // chosen reach. Same shared loader as browse, so the event set is
  // identical across modes; ISR caching bounds the cold-path cost.
  const radiusNow = new Date();
  const radiusEvents = getVisibleEvents(
    await withTimeout(cachedUpcomingEvents(upcomingEventsBucket(radiusNow)), 8000, [] as EventWithMeta[]),
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

/** Browse mode — the clean whole-county default surface. */
function BrowseMode() {
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
        <BrowseMapArea />
      </Suspense>
      {/* The Nearby / Whole county mode toggle was removed from the browse
          surface (owner call 2026-07-08): "the map IS the page" — the clean
          whole-county map is now the sole default and the floating pill read
          as clutter. Radius ("Nearby") mode still exists and is reachable via
          `/map?mode=radius` (it keeps its own toggle to return to browse), so
          nothing breaks and this is fully reversible. */}
      {/* Mark-a-spot left the map entirely (owner call 2026-07-02): the FAB
          and in-map mark mode read as overlay clutter. Marking lives at
          /report (More → "Mark a spot"); submitted reports still render on
          the map via the community-reports layer. */}
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

/** The heavy half of browse mode — the ~10 upstream feeds, all
 *  param-INDEPENDENT now. Loads everything unfiltered and hands it to
 *  BrowseMapClient, which applies the URL-driven view (intent/sub/open/
 *  t/at/amenity) on the client. */
async function BrowseMapArea() {
  const now = new Date();
  const allPlaces = openPlaces(now);
  const [
    incidents,
    fixit,
    mapillaryTrash,
    trailLines,
    transitLines,
    municipalBoundaries,
    countyBoundary,
    waterSites,
    evStations,
    cemeteries,
    fieldAmenities,
    communityReports,
    allWeek,
  ] = await Promise.all([
    // Timeout-guarded (not just .catch'd): a slow upstream degrades to a
    // missing layer instead of hanging the render into a 503.
    //
    // Under ISR these run at build/revalidate time, not per request —
    // the user never waits on them anymore. The ceilings stay so a slow
    // upstream can't stall a revalidation render; every one of these
    // self-hides when empty, so a trimmed-out layer degrades exactly as
    // a failed one already did.
    withTimeout(getChartIncidentsFrederick(), 4500, []),
    withTimeout(getFixItIssues(30), 4500, []),
    withTimeout(fetchMapillaryTrash(), 3000, []),
    withTimeout(getFrederickTrailShapes(), 4000, EMPTY_FC),
    withTimeout(getFrederickTransitRouteShapes(), 4000, EMPTY_FC),
    // County GIS municipal boundary polygons — quiet always-on map
    // outline. Fail-soft to empty so the county server never blocks.
    withTimeout(getMunicipalBoundaries(), 3000, EMPTY_FC),
    // County boundary outline — committed static GeoJSON, the quiet
    // always-on county edge (6.1). Fail-soft to empty.
    withTimeout(getCountyBoundary(), 3000, EMPTY_FC),
    // USGS river gauges — surfaced as a map layer (kind="river_gauge")
    // so the Rivers & creeks dataset isn't trapped on /rivers alone.
    withTimeout(getFrederickWaterSites(), 3000, []),
    // EV charging — authoritative MD iMAP stations (network + connector
    // counts). Upgrades the OSM-crowdsourced ev_charging amenity layer;
    // fail-soft to [] so the map falls back to the OSM points.
    withTimeout(getEvChargingStations(), 3500, []),
    // Historic cemeteries — county GIS heritage layer, opt-in via the
    // Layers panel (OFF by default). Fail-soft to [] so the chip simply
    // doesn't render when the county feed is unreachable.
    withTimeout(getHistoricCemeteries(), 3000, []),
    // Field-collected amenities (the /collect walkabout tool). Reads
    // the field_amenities table; fail-soft to [] (no DB / error) so the
    // map degrades to the static + OSM amenity set, never a 503.
    withTimeout(getFieldAmenities(), 3000, []),
    // Community reports (the /report crowdsourced layer). Fail-soft to [] (no
    // DB / table not migrated / error) so the map degrades cleanly.
    withTimeout(getCommunityReports(), 3000, []),
    // Upcoming events (curated seed + live feeds), deduped + sorted.
    // Shared with the radius branch via loadUpcomingEvents so the two
    // can never drift on what "upcoming" means.
    withTimeout(cachedUpcomingEvents(upcomingEventsBucket(now)), 5000, [] as EventWithMeta[]),
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

  // Authoritative EV charging (MD iMAP) hydrated into Amenity shape, ids
  // prefixed "mdev:" so they never collide with OSM amenity ids. The detail
  // line carries network + connector counts ("ChargePoint · 4 fast, 2 Level
  // 2 · CCS"). When present these REPLACE the crowd-sourced OSM ev_charging
  // points; if the fetch failed (empty), the OSM points stay as the fallback.
  const evChargingAmenities = evStations.map((s) => ({
    id: `mdev:${s.id}`,
    kind: "ev_charging" as const,
    name: s.name,
    detail: evDetailLine(s) || undefined,
    municipality: s.municipality,
    lng: s.lng,
    lat: s.lat,
  }));
  const baseAmenities = evStations.length
    ? allAmenities().filter((a) => a.kind !== "ev_charging")
    : allAmenities();

  const amenities = dedupeAmenities(
    [...baseAmenities, ...evChargingAmenities, ...riverGaugeAmenities, ...fieldAmenities],
    allPlaces.map((p) => ({ name: p.name, category: p.category, geom: p.geom })),
  );

  // Community reports ride the amenity layer as OsmPlace-shaped points under
  // the "Community" tray group (category slug report-<category> → caution
  // marker). Their photo + note flow to the report popup. The note becomes the
  // popup body (address); the label is the subtype, else the category.
  const reportsAsOsm: OsmPlace[] = communityReports.map((r) => {
    const def = REPORT_CATEGORY_BY_KEY[r.category];
    const sub = def?.subtypes.find((s) => s.key === r.subtype);
    return {
      osm_id: r.id, // "report:<uuid>"
      name: (r.title?.trim() || sub?.label || def?.label || "Report"),
      category_slug: `report-${r.category}`,
      osm_tag: r.subtype ?? "",
      address: r.note ?? "",
      lng: r.lng,
      lat: r.lat,
      photo: r.photo,
    };
  });

  // The week's mappable events, pre-shaped as pins. Draw-only (civic
  // meetings/hearings aren't map answers — shared event-kind rule) and
  // geolocated; BrowseMapClient windows these per ?t= against the
  // browser clock and caps the drawn set at 80. Shipped for the WIDEST
  // window ("all" = next 7 days, plus in-progress events) so every time
  // mode can be computed client-side; capped at 400 so the flight
  // payload stays bounded (~pin fields only, no descriptions).
  const weekHorizonMs = now.getTime() + 7 * 24 * 3_600_000;
  const weekEvents: EventPin[] = [];
  for (const e of allWeek) {
    if (isUtilityEvent(e)) continue;
    if (!Number.isFinite(e.geom?.lng) || !Number.isFinite(e.geom?.lat)) continue;
    const sMs = Date.parse(e.starts_at);
    if (!Number.isFinite(sMs) || sMs > weekHorizonMs) continue;
    const eMs = e.ends_at ? Date.parse(e.ends_at) : sMs;
    // Already over (with a small grace for ISR staleness): skip.
    if (Math.max(sMs, eMs) < now.getTime() - 300_000) continue;
    weekEvents.push({
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
    if (weekEvents.length >= 400) break;
  }

  return (
    <div className="relative" style={{ height: BROWSE_MAP_HEIGHT }}>
      <BrowseMapClient
        places={allPlaces}
        civic={civic}
        extraAmenities={[...mapillaryTrash, ...reportsAsOsm]}
        amenities={amenities}
        trailLines={trailLines}
        transitLines={transitLines}
        municipalBoundaries={municipalBoundaries}
        countyBoundary={countyBoundary}
        cemeteries={cemeteries}
        weekEvents={weekEvents}
      />
    </div>
  );
}
