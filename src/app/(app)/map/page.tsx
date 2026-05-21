import type { Metadata } from "next";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import { allUpcoming } from "@/lib/loaders/events";
import AppMapClient, { type CivicPin, type EventPin } from "@/components/map/AppMapClient";
import MapIntentChips from "@/components/map/MapIntentChips";
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";
import { CATEGORY_BY_SLUG } from "@/data/categories";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

const OPEN_PLACES = publicPlaces().map((p) => decoratePlace(p));

export const metadata: Metadata = {
  title: "Map · Frederick County",
  description:
    "The full panable map of Frederick County. Filter by what you're doing. Coffee, food, outdoors, family, arts, civic, sip & taste.",
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
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const [
    { intent: intentParam },
    incidents,
    fixit,
    mapillaryTrash,
    trailLines,
    transitLines,
  ] = await Promise.all([
    searchParams,
    getChartIncidentsFrederick().catch(() => []),
    getFixItIssues(30).catch(() => []),
    fetchMapillaryTrash().catch(() => []),
    getFrederickTrailShapes().catch(() => EMPTY_FC),
    getFrederickTransitRouteShapes().catch(() => EMPTY_FC),
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

  const amenities = dedupeAmenities(
    allAmenities(),
    OPEN_PLACES.map((p) => ({ name: p.name, category: p.category, geom: p.geom })),
  );

  const intent =
    intentParam && intentParam in INTENT_BY_KEY
      ? INTENT_BY_KEY[intentParam as IntentKey]
      : null;
  const places = intent ? OPEN_PLACES.filter(intent.match) : OPEN_PLACES;

  // Events as map pins — the unique-vs-Google-Maps layer. Filter to the
  // next ~36h ("happening soon") so the layer reads as live, not as a
  // permanent overlay. Dedupe by venue cell so two events at the same
  // address don't stack into a single illegible blob.
  const now = new Date();
  const horizonMs = now.getTime() + 36 * 3_600_000;
  const upcoming = allUpcoming(now).filter((e) => {
    const t = Date.parse(e.starts_at);
    return Number.isFinite(t) && t <= horizonMs;
  });
  const seenCells = new Set<string>();
  const events: EventPin[] = [];
  for (const e of upcoming) {
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
    if (events.length >= 40) break;
  }

  return (
    <div
      className="-mx-4 -mt-4 relative"
      style={{
        marginBottom: "calc(-6rem - env(safe-area-inset-bottom, 0px))",
        height: "calc(100dvh - 56px - env(safe-area-inset-top, 0px))",
      }}
    >
      <MapIntentChips
        active={intent?.key}
        activeCount={intent ? places.length : undefined}
      />
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
