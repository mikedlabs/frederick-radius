"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";

const AppMap = dynamic(() => import("./AppMap"), {
  ssr: false,
  // Shimmer of the exact shape it replaces (same height + radius) so
  // there is no layout shift on resolve, per VISUAL.md §4. A faint
  // centered pin signals "map" without a spinner-in-a-box.
  loading: () => (
    <div
      className="shimmer relative grid h-[78vh] place-items-center rounded-[var(--app-radius-lg)]"
      aria-hidden
    >
      <MapPin className="h-9 w-9 opacity-20" style={{ color: "var(--app-ink-3)" }} aria-hidden />
    </div>
  ),
});

/**
 * Map + a results list synced to the viewport. Pan/zoom the map → the list
 * below shows exactly what's in view, nearest-center first, tappable
 * (opens the place sheet). This turns a wall of pins into something you
 * can actually browse.
 */
export type { CivicPin, MapLineFC } from "./AppMap";
import type { CivicPin, MapLineFC } from "./AppMap";
import type { OsmPlace } from "@/lib/integrations/overpass";
import type { Amenity } from "@/lib/loaders/amenities";

const EMPTY_FC: MapLineFC = { type: "FeatureCollection", features: [] };

export default function AppMapClient({
  places,
  civic = [],
  extraAmenities = [],
  amenities = [],
  trailLines = EMPTY_FC,
  transitLines = EMPTY_FC,
}: {
  /** Already decorated server-side (map/page → publicPlaces().map
   *  (decoratePlace)). The client must NOT re-import the loader: it
   *  drags the ~12MB places-enrichment.json into the browser bundle
   *  and the map never loads. */
  places: PlaceCardData[];
  civic?: CivicPin[];
  /** Server-fetched amenity points (e.g. Mapillary trash) merged into
   *  the map's amenity layer — keeps the secret token server-side. */
  extraAmenities?: OsmPlace[];
  /** Curated civic amenities (amenities.json) — always-present set
   *  that backs the Amenities tray + Radius. */
  amenities?: Amenity[];
  /** Server-fetched toggleable line overlays (#3). */
  trailLines?: MapLineFC;
  transitLines?: MapLineFC;
}) {
  const [inView, setInView] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ slug: string; n: number } | null>(null);

  const bySlug = useMemo(() => {
    const m = new Map<string, PlaceCardData>();
    for (const p of places) m.set(p.slug, p);
    return m;
  }, [places]);

  // Already decorated server-side; only attach the viewport-relative
  // distance here (pure, no loader/JSON in the client bundle).
  const results = useMemo(
    () =>
      inView
        .map((slug) => bySlug.get(slug))
        .filter((p): p is PlaceCardData => Boolean(p))
        .map((p) => ({ ...p, distance_m: haversineMeters(FREDERICK_CENTER, p.geom) })),
    [inView, bySlug]
  );

  return (
    <div className="space-y-3">
      <AppMap places={places} onPlacesInView={setInView} focus={focus} civic={civic} extraAmenities={extraAmenities} amenities={amenities} trailLines={trailLines} transitLines={transitLines} />

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="inline-flex items-center gap-1.5 font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            <MapPin className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
            In view
          </h2>
          <span className="text-xs tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {results.length === 0 ? "Move the map" : `${results.length} place${results.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] px-4 py-8 text-center">
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <MapPin className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            </span>
            <p className="font-serif text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Move the map to see places
            </p>
            <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              Everything in view is listed here. Tap any place for details.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {results.map((p) => (
              <li
                key={p.slug}
                onClickCapture={() => setFocus((f) => ({ slug: p.slug, n: (f?.n ?? 0) + 1 }))}
              >
                <PlaceCard place={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
