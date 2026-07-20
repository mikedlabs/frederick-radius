"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { MapLineFC } from "@/components/map/types";

/**
 * The county trail map for /trails. Tap-to-activate so Mapbox only loads
 * when someone actually wants the map (the same on-demand pattern as the
 * brewery TaproomMap, which keeps map JS off the default page load).
 *
 * The star is the trail GEOMETRY: getFrederickTrailShapes() hands ~200
 * named polyline segments from the county Parks GIS, drawn as the Trails
 * layer (defaulted ON here via trailsLayerDefault). The county outline
 * frames it, and the trailhead points are tappable pins.
 */
const AppMapClient = dynamic(() => import("@/components/map/AppMapClient"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[64vh] min-h-[400px] w-full items-center justify-center rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
    >
      <span className="text-[13px]">Bringing up the map</span>
    </div>
  ),
});

export default function TrailsMap({
  places,
  trailLines,
  countyBoundary,
  segmentCount,
}: {
  places: PlaceCardData[];
  trailLines: MapLineFC;
  countyBoundary: MapLineFC;
  segmentCount: number;
}) {
  const [open, setOpen] = useState(false);
  // Nothing to draw (both the geometry feed and the pins are empty) — let
  // the page's list carry the surface rather than show an empty canvas.
  if (segmentCount === 0 && places.length === 0) return null;

  return (
    <section aria-labelledby="trail-map-heading" className="scroll-mt-24">
      <header className="mb-3 space-y-1">
        <p className="eyebrow">Trail map</p>
        <h2
          id="trail-map-heading"
          className="display-2"
          style={{ color: "var(--app-ink)" }}
        >
          See the whole network.
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Every mapped trail segment the county maintains, drawn across the
          county with its parks and trailheads.
        </p>
      </header>

      {open ? (
        <div
          className="relative h-[64vh] min-h-[400px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{ borderColor: "var(--app-border)" }}
        >
          <AppMapClient
            places={places}
            trailLines={trailLines}
            countyBoundary={countyBoundary}
            trailsLayerDefault
            fullBleed
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group grid min-h-[150px] w-full grid-cols-[110px_minmax(0,1fr)] overflow-hidden rounded-[var(--app-radius-lg)] border text-left transition sm:grid-cols-[190px_minmax(0,1fr)]"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <span className="relative min-h-[150px] overflow-hidden" aria-hidden>
            <Image
              src="/images/seasons/summer/083.jpg"
              alt=""
              fill
              sizes="(max-width: 640px) 110px, 190px"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          </span>
          <span className="flex min-w-0 items-center justify-between gap-3 p-4 sm:p-6">
            <span className="min-w-0">
              <span
                className="flex items-center gap-2 text-[10px] font-semibold"
                style={{ color: "var(--app-ink-3)" }}
              >
                <MapIcon className="h-3.5 w-3.5" aria-hidden />
                Interactive map
              </span>
              <span
                className="mt-2 block text-[16px] font-semibold"
                style={{ color: "var(--app-ink)" }}
              >
                Open the trail map
              </span>
              {segmentCount > 0 && (
                <span className="mt-1 block text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                  {segmentCount} mapped segments
                </span>
              )}
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 transition group-hover:translate-x-1"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </span>
        </button>
      )}
    </section>
  );
}
