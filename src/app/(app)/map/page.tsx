import type { Metadata } from "next";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { allAmenities } from "@/lib/loaders/amenities";
import AppMapClient, { type CivicPin } from "@/components/map/AppMapClient";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

// P0-1: one canonical public place set, same as every other route.
// Decorated so map pins use the enrichment-corrected coordinate
// (the guarded Google-coord override in applyEnrichment) instead of
// the wrong DFP-scraped geom — ~157 pins move to where the business
// actually is.
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
    // Server-side: the secret token never reaches the client. Returns
    // [] when no MAPILLARY_TOKEN, so this is inert in any env without it.
    fetchMapillaryTrash().catch(() => []),
    // #3: toggleable line overlays. Graceful empty FC if a feed blips
    // (sandbox can't reach them; Vercel can) — map stays usable.
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

  return (
    <div className="space-y-3">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {OPEN_PLACES.length.toLocaleString()} curated places · plus OpenStreetMap businesses
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Explore the map
        </h1>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          Pan and zoom to anywhere in the county — everything in view lists below. Filter by category up top.
        </p>
      </header>

      <AppMapClient places={OPEN_PLACES} civic={civic} extraAmenities={mapillaryTrash} amenities={allAmenities()} trailLines={trailLines} transitLines={transitLines} />

      <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        Business data from{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          OpenStreetMap contributors
        </a>.
      </p>
    </div>
  );
}
