"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useCallback } from "react";
import { MapPin, Locate, Clock } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";
import { haptic } from "@/lib/haptics";

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
export type { CivicPin, MapLineFC, EventPin } from "./types";
import type { CivicPin, MapLineFC, EventPin } from "./types";
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
  const [focus, setFocus] = useState<{
    slug: string;
    n: number;
    /** Locate-me override: when present, AppMap centers on these
     *  coordinates instead of resolving `slug` against the places
     *  array. Only set by the Locate FAB; the in-view list always
     *  uses pure-slug focuses. */
    lngLat?: { lng: number; lat: number };
  } | null>(null);

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

  // How many of the in-view places are open right now? Surfaced in
  // the drawer header so the peek state carries one extra dimension
  // of useful signal beyond "47 places," which by itself doesn't tell
  // a stranger what's actually reachable. open_status.state values
  // are 'open' | 'closed' | undefined; we only count confident-open.
  const openCount = useMemo(
    () => results.filter((p) => p.open_status?.state === "open").length,
    [results],
  );

  // "Locate me" — re-anchor the map on the user's actual position.
  // Reuses the `focus` channel by passing a `lngLat` override that
  // AppMap's focus effect recognizes (skips slug lookup, flies to
  // coordinates without selecting a pin). That avoids a second
  // dedicated prop just for this case.
  const [locateError, setLocateError] = useState<string | null>(null);
  const onLocateMe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError("Location isn't available on this device.");
      return;
    }
    haptic("light");
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFocus((f) => ({
          slug: "__locate__",
          n: (f?.n ?? 0) + 1,
          lngLat: { lng: pos.coords.longitude, lat: pos.coords.latitude },
        }));
      },
      (err) => {
        setLocateError(err.code === err.PERMISSION_DENIED ? "Location permission denied." : "Couldn't fetch your location.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

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
          openCount={openCount}
          onPick={(slug) =>
            setFocus((f) => ({ slug, n: (f?.n ?? 0) + 1 }))
          }
        />
        {/* Locate-me FAB — floats to the right of the map, sitting
            just above the drawer so the user always has a 1-tap path
            back to their own location. The button is visible from
            every drawer state; the drawer's z-index puts it above
            the button when expanded, which is fine — once you've
            opened the list you don't need locate again. */}
        <button
          type="button"
          onClick={onLocateMe}
          aria-label="Locate me on the map"
          className="absolute right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-2)] transition active:scale-[0.94]"
          style={{
            // ~110px above the drawer's PEEK height (84px) + bottom
            // safe-area, so it never hides behind a notch / Home bar.
            bottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
            color: "var(--app-brand)",
          }}
        >
          <Locate className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
        {locateError && (
          <div
            role="status"
            className="absolute inset-x-4 z-20 rounded-full bg-[var(--app-bg-elevated)] px-3 py-2 text-center text-[12px] shadow-[var(--app-shadow-2)]"
            style={{
              bottom: "calc(170px + env(safe-area-inset-bottom, 0px))",
              color: "var(--app-ink-2)",
            }}
          >
            {locateError}
          </div>
        )}
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
 *
 * Snap states (peek / half / full) tracked client-side.
 *
 * Peek state (May 2026 rebuild)
 *   Used to show just a count + grab handle. Now carries one extra
 *   row of useful info — total / open-now split and an Open-now
 *   toggle chip — so the user can act on the in-view set without
 *   expanding the drawer. The peek state is still the default; what
 *   changed is the density inside the same height.
 *
 * Open-now toggle
 *   Filters `results` to places with confident `open_status === "open"`.
 *   Survives across snap states so a user can open the list with the
 *   filter already engaged. No URL state — this is a transient lens.
 */
function InViewDrawer({
  results,
  openCount,
  onPick,
}: {
  results: PlaceCardData[];
  openCount: number;
  onPick: (slug: string) => void;
}) {
  const [snap, setSnap] = useState<"peek" | "half" | "full">("peek");
  const [openOnly, setOpenOnly] = useState(false);
  // Peek grows slightly to fit the count split + filter chip without
  // hiding the list view. half/full unchanged.
  const heights: Record<typeof snap, string> = {
    peek: "118px",
    half: "55%",
    full: "82%",
  };
  // The list the body renders. When the toggle is on but nothing's
  // open, we still show a tiny "nothing open right now" hint instead
  // of an empty body.
  const filtered = openOnly
    ? results.filter((p) => p.open_status?.state === "open")
    : results;
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-screen-md flex-col rounded-t-[var(--app-radius-xl)] bg-[var(--app-bg-elevated)] tactile-e3"
      style={{
        height: heights[snap],
        transition: "height 280ms var(--app-ease-spring)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* HEADER — grab handle, count split, snap button. The whole
          row is its own tap target for snap cycling; the filter chip
          inside stops propagation so it can be toggled without
          changing the snap state. */}
      <button
        type="button"
        onClick={() =>
          setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"))
        }
        aria-label={snap === "full" ? "Collapse list" : "Expand list"}
        className="flex shrink-0 cursor-grab flex-col items-center gap-1.5 pb-2 pt-2.5"
      >
        <span
          aria-hidden
          className="h-1 w-10 rounded-full"
          style={{ background: "rgba(0,0,0,0.18)" }}
        />
        <div className="flex w-full items-baseline justify-between px-3.5">
          {/* Count split: total / open-now. Tabular numerals so the
              numbers don't shift when the map pans. */}
          <p className="text-[12.5px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {results.length === 0 ? (
              <span style={{ color: "var(--app-ink-3)" }}>Move the map to see places</span>
            ) : (
              <>
                <span className="tabular-nums">{results.length}</span>{" "}
                <span style={{ color: "var(--app-ink-2)" }}>
                  place{results.length === 1 ? "" : "s"} in view
                </span>
                {openCount > 0 && (
                  <span style={{ color: "var(--app-ink-3)" }}>
                    {" · "}
                    <span className="tabular-nums">{openCount}</span> open now
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        {/* OPEN-NOW TOGGLE — sits inside the peek state so the user
            can act on the most-asked-for filter without expanding the
            drawer. Disabled when nothing's open. Survives across snap
            transitions. Click handler stops propagation so the toggle
            doesn't also cycle the drawer's snap. */}
        {results.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-pressed={openOnly}
            aria-label={openOnly ? "Show all places" : "Show only places open now"}
            onClick={(e) => {
              e.stopPropagation();
              if (openCount === 0) return;
              setOpenOnly((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                if (openCount === 0) return;
                setOpenOnly((v) => !v);
              }
            }}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition active:scale-[0.97]"
            style={{
              cursor: openCount === 0 ? "default" : "pointer",
              opacity: openCount === 0 ? 0.5 : 1,
              background: openOnly ? "var(--app-positive)" : "var(--app-bg-sunken)",
              color: openOnly ? "white" : "var(--app-ink-2)",
              border: openOnly ? "none" : "1px solid var(--app-border)",
            }}
          >
            <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Open now
            {openCount > 0 && (
              <span
                className="rounded-full px-1.5 text-[10.5px] tabular-nums"
                style={{
                  background: openOnly ? "rgba(255,255,255,0.22)" : "var(--app-bg-elevated)",
                }}
              >
                {openCount}
              </span>
            )}
          </span>
        )}
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
          {filtered.length === 0 ? (
            <li
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              {openOnly
                ? "Nothing in view is open right now."
                : "Pan or zoom. Places here list above. Tap any to see details."}
            </li>
          ) : (
            filtered.map((p) => (
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
