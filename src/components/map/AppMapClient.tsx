"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Calendar } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import { CATEGORY_BY_SLUG } from "@/data/categories";
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
          events={events}
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
            {results.length === 0
              ? "Loading viewport…"
              : `${results.length} place${results.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {results.length === 0 ? (
          <p
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            Showing Downtown Frederick. As you pan or zoom, places in
            view list here — coffee, restaurants, parks, civic
            buildings, the whole county.
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
 * Filter events to those near the visible viewport. We use the set of
 * places currently in view as a proxy for the viewport: an event is
 * "nearby" if its venue sits within 1.5km of ANY place the user can
 * see. This works without plumbing a separate onEventsInView signal
 * out of AppMap, and degrades sensibly when the viewport is sparse
 * (zero visible places → no nearby events, which is the right answer:
 * if the user can't see anything to do, they can't see anywhere to
 * go either).
 *
 * Exported for unit tests; the runtime consumer is InViewDrawer below.
 */
export function eventsNearVisiblePlaces(
  events: EventPin[],
  visible: { geom: { lng: number; lat: number } }[],
  maxMeters = 1500,
): EventPin[] {
  if (events.length === 0 || visible.length === 0) return [];
  const out: EventPin[] = [];
  for (const e of events) {
    if (!Number.isFinite(e.lng) || !Number.isFinite(e.lat)) continue;
    for (const p of visible) {
      const d = haversineMeters({ lng: e.lng, lat: e.lat }, p.geom);
      if (d <= maxMeters) {
        out.push(e);
        break; // matched at least one — don't double-add
      }
    }
  }
  return out;
}

/**
 * InViewDrawer — slide-up bottom drawer inside the full-bleed map.
 * Three snap states (peek / half / full) tracked client-side. Peek
 * shows just the count + a grab handle; half + full reveal the
 * synced "places + events in view" list scrollable. Apple Maps shape.
 *
 * The mobile review's #1 priority was making this the keystone mobile
 * interaction. The drawer now surfaces BOTH places-in-view and events
 * near those places, so a user panning to Carroll Creek immediately
 * sees "12 places · 3 events nearby" — they can decide-by-day without
 * leaving the map.
 */
function InViewDrawer({
  results,
  events = [],
  onPick,
}: {
  results: PlaceCardData[];
  /** Map's event pins. The drawer filters them down to events near
   *  the visible places via eventsNearVisiblePlaces above. */
  events?: EventPin[];
  onPick: (slug: string) => void;
}) {
  const [snap, setSnap] = useState<"peek" | "half" | "full">("peek");
  const heights: Record<typeof snap, string> = {
    peek: "100px",
    half: "55%",
    full: "82%",
  };

  // Events whose venue is within 1.5km of any visible place. Recomputed
  // when either the visible places change OR the event prop changes,
  // so a time-filter switch (Now / Tonight / Weekend) refreshes the
  // drawer's event count cleanly.
  const eventsHere = useMemo(
    () => eventsNearVisiblePlaces(events, results),
    [events, results],
  );

  // Category mix for the peek pill — shows the dominant categories
  // in the visible viewport as colored dots sized by share. Lets the
  // user read "mostly food + arts" at a glance without expanding.
  const categoryMix = useMemo(() => {
    if (results.length === 0) return [];
    const counts = new Map<string, number>();
    for (const p of results) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([slug, count]) => ({
        slug,
        count,
        color: CATEGORY_BY_SLUG[slug]?.color ?? "#A8462C",
        name: CATEGORY_BY_SLUG[slug]?.name ?? slug,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [results]);

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
        className="flex shrink-0 cursor-grab flex-col items-center justify-center gap-1.5 pb-2.5 pt-2.5"
      >
        <span
          aria-hidden
          className="h-1 w-10 rounded-full"
          style={{ background: "rgba(0,0,0,0.18)" }}
        />
        <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          {results.length === 0 ? (
            "Showing Downtown Frederick"
          ) : (
            <>
              {results.length} place{results.length === 1 ? "" : "s"}
              {eventsHere.length > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--app-brand)" }}>
                    {eventsHere.length} event{eventsHere.length === 1 ? "" : "s"} nearby
                  </span>
                </>
              )}
            </>
          )}
        </p>
        {/* Category mix row — visible only in peek state. Each dot is
            a category present in the visible viewport; size scales
            with that category's share of the total visible places.
            Gives the user a "what's here" read without expanding. */}
        {snap === "peek" && categoryMix.length > 0 && (
          <span
            aria-hidden
            className="flex items-center gap-1.5"
            title={categoryMix.map((c) => `${c.name} · ${c.count}`).join("\n")}
          >
            {categoryMix.map((c) => {
              // 6–14px range — biggest dot for the dominant category.
              const top = categoryMix[0].count;
              const size = Math.max(6, Math.min(14, Math.round(6 + (c.count / top) * 8)));
              return (
                <span
                  key={c.slug}
                  className="inline-block rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: c.color,
                    boxShadow: `0 0 0 1.5px ${c.color}22`,
                  }}
                />
              );
            })}
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
          {results.length === 0 ? (
            <li
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-6 text-center text-sm"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              Pan or zoom to scan this area. Places list here; tap any to open details.
            </li>
          ) : (
            <>
              {/* Events nearby — promoted ABOVE the places list when
                  the visible viewport has any. Time-sensitive surfaces
                  beat time-flat surfaces; if there's a concert at
                  Carroll Creek tonight, the user should see it before
                  scrolling 12 restaurant rows. Tight cards (date pill
                  + title + venue + time) — full event details live
                  on the event detail page. */}
              {eventsHere.length > 0 && (
                <li>
                  <p
                    className="mb-1.5 mt-0.5 inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--app-brand)" }}
                  >
                    <Calendar className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    Events nearby
                  </p>
                  <ul className="space-y-1.5">
                    {eventsHere.slice(0, 5).map((e) => {
                      const start = new Date(e.starts_at);
                      const when = new Intl.DateTimeFormat("en-US", {
                        timeZone: "America/New_York",
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(start);
                      const color = e.category_color ?? "#A8462C";
                      return (
                        <li key={e.slug}>
                          <Link
                            href={`/events/${e.slug}`}
                            className="tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2"
                            style={{
                              borderColor: "var(--app-border)",
                              boxShadow: `inset 3px 0 0 ${color}`,
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className="truncate text-[13px] font-semibold leading-tight"
                                style={{ color: "var(--app-ink)" }}
                              >
                                {e.title}
                              </p>
                              <p
                                className="truncate text-[11px]"
                                style={{ color: "var(--app-ink-3)" }}
                              >
                                {when} · {e.venue_name}
                              </p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <p
                    className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    Places in view
                  </p>
                </li>
              )}
              {results.map((p) => (
                <li key={p.slug} onClickCapture={() => onPick(p.slug)}>
                  <PlaceCard place={p} />
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
