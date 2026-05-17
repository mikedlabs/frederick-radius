import type { Metadata } from "next";
import { publicPlaces } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import AppMapClient, { type CivicPin } from "@/components/map/AppMapClient";

// P0-1: one canonical public place set, same as every other route.
const OPEN_PLACES = publicPlaces();

export const metadata: Metadata = {
  title: "Map",
  description: "Every business, park, trail, library, and civic service in Frederick County on one map.",
};

export const revalidate = 300;

export default async function MapPage() {
  const [incidents, fixit] = await Promise.all([
    getChartIncidentsFrederick().catch(() => []),
    getFixItIssues(30).catch(() => []),
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
          {OPEN_PLACES.length.toLocaleString()} curated · plus every OSM business in the county
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Explore the map
        </h1>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          Pan and zoom to anywhere in the county — everything in view lists below. Filter by category up top.
        </p>
      </header>

      <AppMapClient places={OPEN_PLACES} civic={civic} />

      <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        Business data from{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          OpenStreetMap contributors
        </a>{" "}
        · refreshed daily.
      </p>
    </div>
  );
}
