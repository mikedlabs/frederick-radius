import type { Metadata } from "next";
import { PLACES } from "@/data/places";
import AppMapClient from "@/components/map/AppMapClient";

export const metadata: Metadata = {
  title: "Map",
  description: "Every business, park, trail, library, and civic service in Frederick County on one map.",
};

export default function MapPage() {
  return (
    <div className="space-y-3">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {PLACES.length.toLocaleString()} curated · plus every OSM business in the county
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Explore the map
        </h1>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          Pan and zoom to anywhere in the county — everything in view lists below. Filter by category up top.
        </p>
      </header>

      <AppMapClient places={PLACES} />

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
