"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";

const AppMap = dynamic(() => import("./AppMap"), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-[78vh] place-items-center rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="text-sm" style={{ color: "var(--app-ink-3)" }}>Loading map…</p>
    </div>
  ),
});

/**
 * Map + a results list synced to the viewport. Pan/zoom the map → the list
 * below shows exactly what's in view, nearest-center first, tappable
 * (opens the place sheet). This turns a wall of pins into something you
 * can actually browse.
 */
export type { CivicPin, MapLineFC, EventPin } from "./AppMap";
import type { CivicPin, MapLineFC, EventPin } from "./AppMap";
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
  events = [],
  fullBleed = false,
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
  /** Upcoming events as photo pins — passed through to AppMap. The
   *  /map page filters to "happening soon" server-side so this stays a
   *  small (≤30 item) array. */
  events?: EventPin[];
  /** Full-bleed canvas: the map fills the parent, no card border, no
   *  "In view" list below. The map IS the page. The synced list lives
   *  in a slide-up sheet inside the map area instead. */
  fullBleed?: boolean;
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

  // Full-bleed: the map fills the parent, the "In view" list lives
  // inside a slide-up bottom drawer that the user can collapse to a
  // peek. Standard mobile maps pattern (Apple Maps, Google Maps).
  if (fullBleed) {
    return (
      <div className="relative h-full w-full">
        <AppMap
          places={places}
          onPlacesInView={setInView}
          focus={focus}
          civic={civic}
          extraAmenities={extraAmenities}
          amenities={amenities}
          trailLines={trailLines}
          transitLines={transitLines}
          events={events}
          fullBleed
        />
        <InViewDrawer
          results={results}
          onPick={(slug) =>
            setFocus((f) => ({ slug, n: (f?.n ?? 0) + 1 }))
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AppMap places={places} onPlacesInView={setInView} focus={focus} civic={civic} extraAmenities={extraAmenities} amenities={amenities} trailLines={trailLines} transitLines={transitLines} events={events} />

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
          <p
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            Pan or zoom the map — places here list below. Tap any to see details.
          </p>
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

/**
 * InViewDrawer — slide-up bottom drawer inside the full-bleed map.
 * Three snap states (peek / half / full) tracked client-side. Peek
 * shows just the count + a grab handle; half + full reveal the
 * synced "places in view" list scrollable. Same shape as Apple Maps.
 */
function InViewDrawer({
  results,
  onPick,
}: {
  results: PlaceCardData[];
  onPick: (slug: string) => void;
}) {
  const [snap, setSnap] = useState<"peek" | "half" | "full">("peek");
  const heights: Record<typeof snap, string> = {
    peek: "84px",
    half: "55%",
    full: "82%",
  };
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-screen-md flex-col rounded-t-[var(--app-radius-xl)] bg-[var(--app-bg-elevated)] tactile-e3"
      style={{
        height: heights[snap],
        transition: "height 280ms var(--app-ease-spring)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        type="button"
        onClick={() =>
          setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"))
        }
        aria-label={snap === "full" ? "Collapse list" : "Expand list"}
        className="flex shrink-0 cursor-grab flex-col items-center justify-center gap-1 pb-2 pt-2.5"
      >
        <span
          aria-hidden
          className="h-1 w-10 rounded-full"
          style={{ background: "rgba(0,0,0,0.18)" }}
        />
        <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          {results.length === 0
            ? "Move the map to see places"
            : `${results.length} place${results.length === 1 ? "" : "s"} in view`}
        </p>
      </button>
      {snap !== "peek" && (
        <ul
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3"
          style={{
            // The drawer sits on top of the mapbox-gl canvas, which by
            // default claims vertical pan gestures for the map camera.
            // touch-action: pan-y reserves vertical pans for native
            // scroll inside the list; overscroll-behavior: contain
            // stops the bounce from chaining back to the body / map.
            touchAction: "pan-y",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {results.length === 0 ? (
            <li
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              Pan or zoom. Places here list above. Tap any to see details.
            </li>
          ) : (
            results.map((p) => (
              <li key={p.slug} onClickCapture={() => onPick(p.slug)}>
                <PlaceCard place={p} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
