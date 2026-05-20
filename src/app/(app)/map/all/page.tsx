import type { Metadata } from "next";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import AppMapClient, { type CivicPin } from "@/components/map/AppMapClient";
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

const OPEN_PLACES = publicPlaces().map((p) => decoratePlace(p));

export const metadata: Metadata = {
  title: "Map · Frederick County",
  description: "The full panable map. 2,400+ places, every category, fits the whole county.",
};

export const revalidate = 300;

export default async function FullMapPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const [{ intent: intentParam }, incidents, fixit, mapillaryTrash, trailLines, transitLines] = await Promise.all([
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

  // If an ?intent= deep-link arrives from the Discover surface, pre-
  // filter the place set so the heavy map opens narrowed instead of
  // dumping every pin on the user.
  const intent =
    intentParam && intentParam in INTENT_BY_KEY
      ? INTENT_BY_KEY[intentParam as IntentKey]
      : null;
  const places = intent ? OPEN_PLACES.filter(intent.match) : OPEN_PLACES;

  return (
    <div
      className="-mx-4 -mt-4 relative"
      style={{
        marginBottom: "calc(-6rem - env(safe-area-inset-bottom, 0px))",
        height: "calc(100dvh - 56px - env(safe-area-inset-top, 0px))",
      }}
    >
      <AppMapClient
        places={places}
        civic={civic}
        extraAmenities={mapillaryTrash}
        amenities={amenities}
        trailLines={trailLines}
        transitLines={transitLines}
        fullBleed
      />
    </div>
  );
}
