import type { Metadata } from "next";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import AppMapClient, { type CivicPin } from "@/components/map/AppMapClient";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

// P0-1: one canonical public place set, same as every other route.
const OPEN_PLACES = publicPlaces().map((p) => decoratePlace(p));

export const metadata: Metadata = {
  title: "Map",
  description: "Every business, park, trail, library, and civic service in Frederick County on one map.",
};

export const revalidate = 300;

export default async function MapPage() {
  const [incidents, fixit, mapillaryTrash, trailLines, transitLines] = await Promise.all([
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

  // Full-bleed — escape the (app) layout's px-4 + pt-4 + the bottom
  // safe-area padding so the map fills the viewport edge to edge. The
  // controls float inside the map, not above it. The page header is
  // gone: the map IS the page.
  return (
    <div
      className="-mx-4 -mt-4 relative"
      style={{
        marginBottom: "calc(-6rem - env(safe-area-inset-bottom, 0px))",
        height: "calc(100dvh - 56px - env(safe-area-inset-top, 0px))",
      }}
    >
      <AppMapClient
        places={OPEN_PLACES}
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
