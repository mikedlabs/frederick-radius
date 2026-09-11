"use client";

import { Map as MapIcon } from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import {
  breweryMapBounds,
  breweryTownCounts,
} from "@/lib/beer/brewery-map";
import type { PlaceCardData } from "@/lib/loaders/places";
import AppMapClient from "@/components/map/AppMapClient";

export default function TaproomMap({ places }: { places: PlaceCardData[] }) {
  if (places.length === 0) return null;

  const bounds = breweryMapBounds(places);
  const townCounts = breweryTownCounts(places);
  // This map has one subject. Brewer's Alley is stored as a restaurant and
  // Springfield Manor as a winery in the general catalog, but both are part of
  // this verified brewery guide. One marker language keeps the map legible.
  const mapPlaces = places.map((place) => ({
    ...place,
    category: "brewery",
  }));
  const activeSlugs = mapPlaces.map((place) => place.slug);

  return (
    <section
      id="taproom-map"
      aria-labelledby="taproom-map-heading"
      className="scroll-mt-24"
      data-brewery-map-count={places.length}
    >
      <header className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p
            className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-amber-text)" }}
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden />
            County view
          </p>
          <h2
            id="taproom-map-heading"
            className="font-sans text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]"
            style={{ color: "var(--app-ink)" }}
          >
            The brewery map
          </h2>
        </div>
        <p
          className="max-w-[28rem] text-[12px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          All {places.length} guides are in view. Tap a cluster to zoom in or a
          marker for details.
        </p>
      </header>

      <div
        className="mb-3 flex items-center gap-2 overflow-x-auto border-y py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ borderColor: "var(--app-border)" }}
        role="region"
        aria-label="Breweries by town"
        tabIndex={0}
      >
        {townCounts.map(({ municipality, count }) => {
          const town =
            MUNICIPALITY_BY_SLUG[municipality]?.name ?? municipality;
          return (
            <span
              key={municipality}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-3 text-[11px] font-semibold"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-ink-2)",
              }}
            >
              {town}
              <span
                className="tabular-nums"
                style={{ color: "var(--app-amber-text)" }}
              >
                {count}
              </span>
            </span>
          );
        })}
      </div>

      <div
        className="relative h-[clamp(430px,62vh,640px)] w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border-strong)" }}
        role="region"
        aria-label={`Interactive map of ${places.length} Frederick County breweries`}
      >
        <AppMapClient
          places={mapPlaces}
          fullBleed
          showSearchControls={false}
          compactSubjectMap
          activeSlugs={activeSlugs}
          initialBounds={bounds ?? undefined}
          initialBoundsPadding={{ top: 24, right: 24, bottom: 96, left: 24 }}
          cameraMinZoom={8.25}
        />
      </div>
    </section>
  );
}
