import type { Metadata } from "next";
import { Suspense } from "react";
import { getCountyBoundary } from "@/lib/integrations/fcGis";
import BrowseMapClient from "@/components/map/BrowseMapClient";
import MapModeGate from "@/components/map/MapModeGate";
import MapWarmup from "@/components/map/MapWarmup";
import MapLoadingScene from "@/components/map/MapLoadingScene";
import DeferredRadiusBuilder from "@/components/radius/DeferredRadiusBuilder";
import PageBloom from "@/components/ui/PageBloom";
import { todaysDeals } from "@/lib/loaders/todaysDeals";
import { CURRENT_TRANSIT_STOPS } from "@/lib/transit-static";
import { MARC_STATIONS } from "@/data/marc-stations";
import {
  activeServiceIds,
  etNowParts,
  formatMarcClock,
  nextScheduled,
} from "@/lib/integrations/marcTrains";
import type { MarcStationPin, TransitStopPin } from "@/components/map/types";

export const metadata: Metadata = {
  alternates: { canonical: "/map" },
  title: "Map · Frederick County",
  description:
    "Browse Frederick County places and events on an interactive map. Filter by category or current need.",
  openGraph: { title: "Map · Frederick County", description:
    "Browse Frederick County places and events on an interactive map. Filter by category or current need." },
};

export const revalidate = 300;
// The browse route renders only committed core geography and schedules.
// Optional live/provider layers hydrate from /api/map/layers after the map is
// usable, so a cold upstream cannot stall this page's initial response.
export const maxDuration = 10;

/**
 * /map — the map IS the page, and now it's a STATIC (ISR) page.
 *
 * This route used to `await searchParams` to pick browse vs radius mode
 * and to apply the ?intent/?sub/?t/?open/?at/?amenity view — which, in
 * Next 16, opted the whole route out of static rendering. Every request
 * (worst: the first after a deploy) re-ran the ~10-feed fan-out
 * server-side (~8s TTFB cold). Restructured 2026-07:
 *
 *   - Core geography and schedules are param-independent and happen here at
 *     build/revalidate time. Optional provider layers hydrate after the
 *     committed place snapshot is usable.
 *   - BOTH mode branches render server-side; MapModeGate (client) picks
 *     one from the live URL. Only the chosen branch mounts.
 *   - The URL-driven browse view (intent/sub/open/t/at/amenity) moved
 *     into BrowseMapClient, which reads useSearchParams — the map was
 *     always a client-only canvas (`ssr: false`), so nothing visual left
 *     the prebuilt HTML except what was never in it.
 *
 * Event time windows are computed against the browser clock, so they do not
 * drift while somebody keeps the map open.
 */
export default function MapPage() {
  return (
    <>
      {/* Keep the page's semantic identity outside the useSearchParams
          boundary. MapModeGate resolves its branch after hydration, so a
          heading inside BrowseMode or RadiusMode is absent from the raw HTML
          that crawlers and reader tools receive. sr-only preserves the
          full-screen map layout while exposing one stable page heading in
          both the server response and the hydrated document. */}
      <h1 className="sr-only">Frederick County map</h1>
      {/* The map used to preconnect to api. and events.mapbox.com here.
          Both are gone: tiles, glyphs, sprites and the style are all served
          from this origin now, so there is no third party left to warm. */}
      {/* Warm the maplibre-gl chunk from the static shell, in parallel with
          hydration — both modes render a GL canvas. */}
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
    <div className="relative -mx-4 sm:-mx-5 lg:ml-0">
      <MapLoadingSurface />
    </div>
  );
}

/** One branded, height-stable fallback for both static Suspense boundaries.
 * Keeping this in the server-rendered page means the first byte already
 * carries useful Frederick-specific feedback; hydration no longer swaps a
 * generic pulse into a second loading scene before the map appears. */
function MapLoadingSurface() {
  return (
    <div className="relative overflow-hidden" style={{ height: BROWSE_MAP_HEIGHT }}>
      <MapLoadingScene height="100%" />
    </div>
  );
}

/** Radius ("Nearby") mode — no UI entry point (owner call 2026-07-08),
 * reachable via /map?mode=radius. The reach controls and committed places
 * render immediately; optional amenities and events hydrate client-side. */
function RadiusMode() {
  return (
    <div className="relative mx-auto max-w-screen-md space-y-3 lg:max-w-screen-lg">
      <PageBloom variant="cool" />
      <DeferredRadiusBuilder />
    </div>
  );
}
/** Browse mode — the clean whole-county default surface. */
function BrowseMode() {
  return (
    <div className="relative -mx-4 sm:-mx-5 lg:ml-0">
      <Suspense
        fallback={<MapLoadingSurface />}
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

// Reserve only the chrome that is actually visible: TopBar plus the floating
// BottomNav below lg, and TopBar alone once SideRail replaces BottomNav.
// One source of truth keeps the page and loading skeleton in lockstep.
const BROWSE_MAP_HEIGHT = "var(--app-browse-map-height)";

/** Core browse-map response. Provider-backed and specialist layers are
 *  intentionally absent here; BrowseMapClient hydrates them only after the
 *  committed place layer succeeds. URL-driven views remain client-side. */
async function BrowseMapArea() {
  const now = new Date();

  // Keep the first response independent from optional providers. The county
  // outline is a committed local GeoJSON file; places arrive from the
  // committed /api/map/places snapshot. Everything live or specialist loads
  // after those core layers are usable through /api/map/layers.
  const countyBoundary = await getCountyBoundary();

  // Transit stop dots + MARC stations use committed GTFS snapshots. They are
  // safe to prepare in the core response and do not call an upstream service.
  const transitStops: TransitStopPin[] = CURRENT_TRANSIT_STOPS.map((stop) => ({
    id: stop.id,
    name: stop.name,
    lng: stop.lng,
    lat: stop.lat,
  }));
  const marc = etNowParts(now);
  const marcActive = activeServiceIds(marc.ymd, marc.weekday);
  const marcStations: MarcStationPin[] = MARC_STATIONS.map((station) => ({
    name: station.name,
    lng: station.lng,
    lat: station.lat,
    departures: [
      ...nextScheduled(station.stopIds.eb, marc.minutes, marcActive, 2),
      ...nextScheduled(station.stopIds.wb, marc.minutes, marcActive, 2),
    ]
      .sort((a, b) => a.min - b.min)
      .slice(0, 3)
      .map((departure) => ({
        clock: formatMarcClock(departure.t),
        headsign: departure.headsign
          .toLowerCase()
          .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
      })),
  }));

  return (
    <div className="relative" style={{ height: BROWSE_MAP_HEIGHT }}>
      <BrowseMapClient
        dealSlugsToday={[
          ...new Set(todaysDeals(now, 999).map((deal) => deal.slug)),
        ]}
        countyBoundary={countyBoundary}
        transitStops={transitStops}
        marcStations={marcStations}
      />
    </div>
  );
}
