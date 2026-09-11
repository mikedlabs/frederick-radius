"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppMapClient, {
  type EventPin,
  type MapLineFC,
} from "@/components/map/AppMapClient";
import type { MapPinPlace, MarcStationPin, TransitStopPin } from "@/components/map/types";
import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
} from "@/components/map/deferredBrowseLayers";
import {
  AMENITY_GROUPS,
  FREDERICK_BROWSE_MAX_BOUNDS,
  FREDERICK_BROWSE_MIN_ZOOM,
  FREDERICK_COUNTY_BOUNDS,
} from "@/components/map/constants";
import { defaultTimeMode, type TimeMode } from "@/components/map/dockCaption";
import { getIntentByKey, INTENTS } from "@/data/intents";
import { isOpenNow } from "@/lib/hours";
import {
  easternMoment,
  smartMapDefault,
  type SmartMapDefault,
} from "@/lib/map/smartDefaults";
import { mayOfferOpenNow } from "@/lib/hours-availability";
import { isLiveMusicEvent } from "@/lib/events/live-music";
import { eventMatchesMapNowWindow } from "@/lib/events/map-window";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import {
  getScope,
  parseScope,
  scopeCentroid,
  SCOPE_PARAM,
  type Scope,
} from "@/lib/scope";
import MapLoadingScene from "./MapLoadingScene";
import {
  loadMapPlaces,
  resetMapPlacesRequest,
} from "./mapPlacesClient";
import { loadMapLayers } from "./mapLayersClient";
import type { MapLayerGroup } from "./deferredBrowseLayers";

/**
 * BrowseMapClient — the param-dependent half of /map's browse mode.
 *
 * Everything here used to run server-side in the page, which forced the
 * whole route dynamic (reading `searchParams` opts a Next 16 route out
 * of ISR). The cached map-place request is warmed from the static shell.
 * Optional civic, amenity, live, line, and event layers begin loading only
 * after that core place request succeeds, so a slow provider cannot hold the
 * first usable map behind the loading scene. This component then applies the
 * URL-driven view:
 *
 *   ?intent / ?sub  — the intent chip filters (INTENT_BY_KEY matchers
 *                     run fine against MapPinPlace records)
 *   ?open=now       — collapse to places open right now (open_status is
 *                     server-computed per ISR render, so it's at most
 *                     revalidate-seconds stale — same bound as before)
 *   ?t=             — the event time window (now/tonight/weekend/all)
 *   ?at=            — deep-link camera seed
 *   ?amenity=       — deep-link amenity tray groups
 *
 * This also makes chip taps cheaper in spirit: the URL still changes (so
 * views stay shareable), but the server always answers with the same
 * cached static payload instead of re-rendering per param combination.
 *
 * Time-sensitive event windows use a visibility-aware browser clock. A map
 * left open across an event boundary updates itself instead of keeping the
 * moment from its first mount forever.
 */

/**
 * Decide which event-time window the map shows. Returns a predicate so
 * the pin loop stays a single pass. (Moved verbatim from the page.)
 *
 * Modes:
 *   - "now":     live right now (start ≤ now ≤ end) OR starting in the
 *                next 90 minutes
 *   - "tonight": starting between now (clamped to today 16:00 ET) and
 *                tomorrow 02:30 ET
 *   - "weekend": Friday 17:00 ET → Monday 00:00 ET (shared horizon
 *                window, clamped to the CURRENT weekend on Sat/Sun)
 *   - "all":     next 7 days, capped at 80 by the loop below
 */
function eventTimePredicate(
  mode: TimeMode,
  now: Date,
): (startsAt: string, endsAt?: string, isAllDay?: boolean) => boolean {
  const nowMs = now.getTime();
  if (mode === "now") {
    return (s, e, isAllDay) =>
      eventMatchesMapNowWindow(
        { starts_at: s, ends_at: e, is_all_day: isAllDay },
        now,
      );
  }
  if (mode === "tonight") {
    const { year, month, day } = easternParts(now);
    const start = Math.max(nowMs, Date.parse(easternWallToUtcISO(year, month, day, 16, 0)));
    const end = Date.parse(easternWallToUtcISO(year, month, day + 1, 2, 30));
    return (s) => {
      const sMs = Date.parse(s);
      return Number.isFinite(sMs) && sMs >= start && sMs <= end;
    };
  }
  if (mode === "weekend") {
    const { weekendStart, weekendEnd } = buildHorizonBounds(now);
    return (s) => {
      const sMs = Date.parse(s);
      return Number.isFinite(sMs) && sMs >= weekendStart && sMs <= weekendEnd;
    };
  }
  const horizon = nowMs + 7 * 24 * 3_600_000;
  return (s) => {
    const sMs = Date.parse(s);
    return Number.isFinite(sMs) && sMs >= nowMs && sMs <= horizon;
  };
}

function isTimeMode(s: string | undefined): s is TimeMode {
  return s === "now" || s === "tonight" || s === "weekend" || s === "all";
}

export default function BrowseMapClient({
  dealSlugsToday,
  countyBoundary,
  transitStops,
  marcStations,
}: {
  /** Slugs running a verified special today (server-computed, day-gated). */
  dealSlugsToday: string[];
  /** The committed county edge is the only server-provided geometry. */
  countyBoundary: MapLineFC;
  /** Bus-stop dots + MARC stations for the Transit layer (phase 3). */
  transitStops: TransitStopPin[];
  marcStations: MarcStationPin[];
}) {
  const sp = useSearchParams();
  const [placeAttempt, setPlaceAttempt] = useState(0);
  const [placeLoad, setPlaceLoad] = useState<
    | { status: "loading"; places: MapPinPlace[] }
    | { status: "ready"; places: MapPinPlace[] }
    | { status: "error"; places: MapPinPlace[] }
  >({ status: "loading", places: [] });
  const [deferredLayers, setDeferredLayers] = useState(
    EMPTY_DEFERRED_BROWSE_LAYERS,
  );
  useEffect(() => {
    let alive = true;
    void loadMapPlaces()
      .then((payload) => {
        if (alive) setPlaceLoad({ status: "ready", places: payload.places });
      })
      .catch(() => {
        if (alive) setPlaceLoad({ status: "error", places: [] });
      });
    return () => {
      alive = false;
    };
  }, [placeAttempt]);
  useEffect(() => {
    if (placeLoad.status !== "ready") return;
    let alive = true;

    // Committed place context and the small decision-signal snapshot load in
    // parallel after the first usable map. The signal request carries only
    // summarized weather, air, market, and road-trend facts; full road layers
    // remain demand-loaded when someone asks for them.
    for (const group of ["context", "signals"] as const) {
      void loadMapLayers([group])
        .then((payload) => {
          if (alive) setDeferredLayers(payload);
        })
        .catch(() => {
          // Optional layers have always failed soft. The committed place and
          // county layers remain usable, and a later navigation retries.
        });
    }

    return () => {
      alive = false;
    };
  }, [placeLoad.status]);
  const allPlaces = placeLoad.places;
  const {
    civic,
    extraAmenities,
    amenities,
    trailLines,
    transitLines,
    municipalBoundaries,
    cemeteries,
    parking,
    weekEvents,
    foodTruckPins,
    roadWorkZones,
    floodContext,
    snowRoutes,
    smartSignals,
    sourceHealth,
  } = deferredLayers;
  const intentParam = sp.get("intent") ?? undefined;
  const subParam = sp.get("sub") ?? undefined;
  const tParam = sp.get("t") ?? undefined;
  const openParam = sp.get("open") ?? undefined;
  const atParam = sp.get("at") ?? undefined;
  const amenityParam = sp.get("amenity") ?? undefined;

  const requestLayerGroups = useCallback((groups: readonly MapLayerGroup[]) => {
    void loadMapLayers(groups)
      .then(setDeferredLayers)
      .catch(() => {
        // The active tool remains selected and can be retried on a later tap.
      });
  }, []);

  useEffect(() => {
    if (placeLoad.status !== "ready") return;
    const requested = new Set<MapLayerGroup>();
    const show = new Set(
      (sp.get("show") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (isTimeMode(sp.get("t") ?? undefined) || sp.get("music") === "tonight") {
      requested.add("events");
    }
    if (amenityParam) requested.add("amenities");
    if (show.has("trails") || show.has("cemeteries")) requested.add("outdoors");
    if (show.has("transit")) requested.add("transit");
    if (show.has("parking")) requested.add("parking");
    if (show.has("civic") || show.has("traffic") || show.has("incidents")) {
      requested.add("roads");
    }
    const requestedScope = parseScope(sp.get(SCOPE_PARAM));
    if (requestedScope && requestedScope !== "county") requested.add("boundaries");
    const scene = sp.get("scene");
    if (scene === "buses-now") requested.add("transit");
    if (scene === "roads-now") requested.add("roads");
    if (scene === "outside-now") {
      requested.add("outdoors");
      requested.add("amenities");
    }
    if (scene === "what-changed") requested.add("boundaries");
    if (requested.size > 0) requestLayerGroups([...requested]);
  }, [amenityParam, placeLoad.status, requestLayerGroups, sp]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | null = null;

    const scheduleMinute = () => {
      if (timer !== null) window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      const delay = 60_000 - (Date.now() % 60_000) + 100;
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleMinute();
      }, delay);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        scheduleMinute();
      } else if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    scheduleMinute();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  // A URL-carried scope wins. Otherwise honor the browsing lens the person
  // already chose in Ask, Today, Events, or the location chip. The earlier
  // county-only reset made a successful Near me answer open a county camera,
  // so the label, ranking, counts, and map frame contradicted one another.
  // A first visit still opens on the whole county because getScope() is null.
  const explicitScope = parseScope(sp.get(SCOPE_PARAM));
  const [scope] = useState<Scope>(() => explicitScope ?? getScope() ?? "county");
  // A town scope resolves to a fixed centroid; nearme/county don't.
  const scopeCenter = scopeCentroid(scope);

  // Deep-link a specific amenity layer on (/map?amenity=restroom,water).
  // Validate against the real tray group keys so a junk param can't
  // activate a nonexistent layer; undefined → clean map as before.
  const validAmenityGroups = new Set(AMENITY_GROUPS.map((g) => g.key));
  const initialAmenityGroups = amenityParam
    ? amenityParam.split(",").map((s) => s.trim()).filter((k) => validAmenityGroups.has(k))
    : undefined;

  // Where the map opens. Priority:
  //   1. an explicit deep-link camera — /map?at=lat,lng (sanity-bound to the
  //      county; a bad coord falls through),
  //   2. a TOWN scope — open on that town's centroid (this is the static
  //      initial view, so there's no jarring flyTo),
  //   3. otherwise the whole-county default. A "near me" scope
  //      carries no fixed point, so it falls here and is handled by
  //      recenterToKnownLocation below (fly to the device fix after mount).
  // Returns [lng, lat] for Mapbox; the ?at= row emits lat,lng.
  const parsedAt = ((): [number, number] | null => {
    if (atParam) {
      const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(atParam.trim());
      if (m) {
        const lat = +m[1];
        const lng = +m[2];
        if (lat >= 38.8 && lat <= 39.9 && lng >= -77.9 && lng <= -76.9) return [lng, lat];
      }
    }
    return null;
  })();
  const initialCenter = ((): [number, number] => {
    if (parsedAt) return parsedAt;
    if (scopeCenter) return [scopeCenter.lng, scopeCenter.lat];
    return [-77.41, 39.46];
  })();
  const initialZoom = parsedAt ? 14 : scopeCenter ? 13.4 : scope === "nearme" ? 14 : 9.6;
  // Near-me links still need a truthful whole-county fallback when no fresh,
  // in-county cached fix exists. AppMap lets a valid cached fix outrank these
  // bounds without auto-prompting for location.
  const initialBounds = !parsedAt && (scope === "county" || scope === "nearme")
    ? FREDERICK_COUNTY_BOUNDS
    : undefined;

  const intent = getIntentByKey(intentParam);
  // First-tier filter: top intent.
  const intentPlaces = intent ? allPlaces.filter(intent.match) : allPlaces;
  // Sub-counts (parent-scoped) — computed BEFORE the sub-filter is
  // applied so each sub-chip shows the population reachable from the
  // current parent state.
  const subCounts: Record<string, number> = {};
  if (intent?.subIntents) {
    for (const s of intent.subIntents) {
      subCounts[s.key] = intentPlaces.filter(s.match).length;
    }
  }
  // Second-tier filter: sub-intent, scoped to the active parent. Ignored
  // when the parent intent doesn't define this sub key.
  const activeSub = intent?.subIntents?.find((s) => s.key === subParam);
  const subFiltered = activeSub
    ? intentPlaces.filter(activeSub.match)
    : intentPlaces;
  // Third-tier filter: ?open=now collapses the pool to places verifiably
  // open right this minute (open or closing-soon). open_status is
  // server-baked per ISR render, so "now" here is bounded-stale
  // (≤ revalidate + the 5-minute decoration bucket) — same as before.
  const openNowCount = subFiltered.filter((p) =>
    isOpenNow(p.open_status),
  ).length;
  const decidedHoursCount = subFiltered.filter(
    (place) =>
      place.open_status.state !== "unknown" &&
      place.open_status.state !== "unverified",
  ).length;
  // A positive confirmed count is always useful. A zero count may only enable
  // the filter when enough of this exact result set can state open or closed;
  // countywide coverage cannot speak for a sparse coffee/town subset.
  const openNowAvailable =
    mayOfferOpenNow(subFiltered.map((place) => place.open_status));
  const openNow = openParam === "now" && openNowAvailable;
  const afterOpen = openNow
    ? subFiltered.filter((p) => isOpenNow(p.open_status))
    : subFiltered;
  // Fourth tier: ?deals=today collapses to places running a verified
  // special today. Count computed BEFORE the filter (same convention as
  // openNowCount) so the When pane can offer the view with its size.
  const dealSet = new Set(dealSlugsToday);
  const dealsOn = sp.get("deals") === "today";
  const dealsTodayCount = afterOpen.filter((p) => dealSet.has(p.slug)).length;
  const places = dealsOn ? afterOpen.filter((p) => dealSet.has(p.slug)) : afterOpen;

  // Events as map pins, scoped to the active temporal window (?t=).
  // Per-mode counts drive the time-aware default-window pick
  // (dockCaption.defaultTimeMode) so the map never opens with zero event
  // pins when there are events one window over — and so the dock's When
  // word can name the window the map is genuinely showing. (Counts run
  // over the MAPPABLE week set — events without coordinates were never
  // drawn, so they don't influence the default pick.)
  const counts: Partial<Record<TimeMode, number>> = {};
  for (const mode of ["now", "tonight", "weekend", "all"] as const) {
    const pred = eventTimePredicate(mode, now);
    counts[mode] = weekEvents.filter((e) =>
      pred(e.starts_at, e.ends_at, e.is_all_day),
    ).length;
  }
  // ?music=tonight — the live-music lens: the event layer collapses to
  // tonight's confirmed shows (isLiveMusicEvent over the pin's own
  // category/venue/title — the same filter /live-music uses, so the map
  // and the radar can never disagree). Forces the tonight window.
  const musicTonight = sp.get("music") === "tonight";
  const timeModeExplicit = isTimeMode(tParam);
  const timeMode: TimeMode = musicTonight
    ? "tonight"
    : timeModeExplicit
      ? tParam
      : defaultTimeMode(counts);

  const matchTime = eventTimePredicate(timeMode, now);
  const eventCells = new Set<string>();
  const events: EventPin[] = [];
  // Events are powerful map context after someone asks for a time. They are
  // not neutral county furniture: inferred windows created a downtown pile of
  // calendar pucks before the visitor made a choice.
  if (timeModeExplicit || musicTonight) {
    for (const e of weekEvents) {
      if (!matchTime(e.starts_at, e.ends_at, e.is_all_day)) continue;
      if (
        musicTonight &&
        !isLiveMusicEvent({ category: e.category, venue_place_slug: e.venue_place_slug, title: e.title })
      )
        continue;
      // Keep every occurrence at an accepted venue cell. AppMap groups these
      // into one count marker and a chronological drawer, so co-located events
      // are no longer silently discarded. Cap distinct cells (not events) to
      // keep the DOM marker budget bounded.
      const cell = `${e.lat.toFixed(4)}:${e.lng.toFixed(4)}`;
      if (!eventCells.has(cell)) {
        if (eventCells.size >= 80) continue;
        eventCells.add(cell);
      }
      events.push(e);
    }
  }

  // Count for the dock's Live-music chip: tonight's confirmed shows,
  // regardless of the active window (offered before you commit).
  const tonightPred = eventTimePredicate("tonight", now);
  const musicTonightCount = weekEvents.filter(
    (e) =>
      tonightPred(e.starts_at, e.ends_at, e.is_all_day) &&
      isLiveMusicEvent({ category: e.category, venue_place_slug: e.venue_place_slug, title: e.title }),
  ).length;

  // Per-intent counts over the unfiltered pool — the What pane's chips.
  // ~12 single-pass filters over ~1,700 pin records; cheap, and this
  // component only re-renders when the URL view changes.
  const intentCounts: Record<string, number> = {};
  for (const i of INTENTS) intentCounts[i.key] = allPlaces.filter(i.match).length;

  // A place/open/deal filter constrains the actual curated GeoJSON source,
  // not just its paint. Mapbox clusters before styling, so leaving faded
  // nonmatches in the source would make a Coffee bubble count restaurants and
  // services too. With no place filter we pass null and preserve the complete
  // clustered county map.
  const anyPlaceFilter = Boolean(intent || activeSub || openNow || dealsOn);
  const activeSlugs = anyPlaceFilter ? places.map((p) => p.slug) : null;

  // Map program phase 1: the moment-aware cold-open default. It may speak
  // ONLY on a truly clean arrival — any URL-carried view (layers, windows,
  // lenses, filters, searches, targets) means the visitor or a shared link
  // already chose, and the smart default stays silent. Latched once per
  // mount: the visibility-refresh `now` must not flip suggestions under a
  // person mid-session.
  const smartDefaultResolved = useRef(false);
  const [smartDefault, setSmartDefault] = useState<SmartMapDefault | null>(null);
  useEffect(() => {
    if (smartDefaultResolved.current || !smartSignals) return;
    const explicitStateKeys = [
      "show", "t", "music", "deals", "intent", "sub", "open", "q", "at",
      "c", "in", "amenity", "aerial", "scene",
    ];
    smartDefaultResolved.current = true;
    if (explicitStateKeys.some((key) => sp.has(key))) return;
    const timer = window.setTimeout(() => {
      setSmartDefault(
        smartMapDefault(easternMoment(now), {
          ...smartSignals,
          musicTonightCount,
          parkingCount: parking.length,
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [musicTonightCount, now, parking.length, smartSignals, sp]);

  if (placeLoad.status === "loading") {
    return (
      <MapLoadingScene
        height="100%"
        status="Loading Frederick County places."
      />
    );
  }

  if (placeLoad.status === "error") {
    return (
      <div
        role="alert"
        className="grid h-full place-items-center px-6 text-center"
        style={{ background: "var(--app-bg-sunken)" }}
      >
        <div className="max-w-sm">
          <p
            className="font-serif text-lg font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            The place layer did not load.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--app-ink-2)" }}>
            The map kept your view. Try the place layer again.
          </p>
          <button
            type="button"
            className="tap-44 mt-4 min-h-11 rounded-full border px-4 text-sm font-semibold"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-bg-elevated)",
              color: "var(--app-ink)",
            }}
            onClick={() => {
              resetMapPlacesRequest();
              setPlaceLoad({ status: "loading", places: [] });
              setPlaceAttempt((attempt) => attempt + 1);
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppMapClient
      places={allPlaces}
      activeSlugs={activeSlugs}
      civic={civic}
      extraAmenities={extraAmenities}
      amenities={amenities}
      trailLines={trailLines}
      transitLines={transitLines}
      municipalBoundaries={municipalBoundaries}
      countyBoundary={countyBoundary}
      cemeteries={cemeteries}
      parking={parking}
      events={events}
      transitStops={transitStops}
      marcStations={marcStations}
      foodTruckPins={foodTruckPins}
      roadWorkZones={roadWorkZones}
      floodContext={floodContext}
      snowRoutes={snowRoutes}
      smartDefault={smartDefault}
      sceneContext={{
        outdoorSafetyHold: smartSignals?.outdoorSafetyHold ?? null,
        conditions: smartSignals?.conditionsStatus ?? "unavailable",
      }}
      mapLayerSourceHealth={sourceHealth}
      onLayerDemand={requestLayerGroups}
      fullBleed
      // Center on the user's known location and measure from there when
      // arriving via a category tile (?intent=…) OR under a "near me" scope
      // (which carries no fixed centroid — the device fix IS its center).
      // A TOWN scope wins over the intent-recenter, though: the user picked
      // that lens deliberately, so its centroid (initialCenter) holds.
      recenterToKnownLocation={
        !parsedAt &&
        scope !== "county" &&
        (Boolean(intent) || scope === "nearme") &&
        !scopeCenter
      }
      // Show the county by default — never an empty map. The curated
      // places ride a CLUSTERED source, so "all ~1,700" reads as tidy
      // numbered bubbles; the dock REFINES rather than gates.
      pinpointDefault={false}
      initialCenter={initialCenter}
      initialZoom={initialZoom}
      initialBounds={initialBounds}
      cameraMinZoom={FREDERICK_BROWSE_MIN_ZOOM}
      cameraMaxBounds={FREDERICK_BROWSE_MAX_BOUNDS}
      initialAmenityGroups={initialAmenityGroups}
      // The map dock (MapDock) — the one instrument that replaced the
      // intent banner, sub strip, Open-now pill, and Layers drawer. The
      // dock writes the same URL params this component reads.
      dock={{
        intentKey: intent?.key,
        subKey: activeSub?.key,
        openNow,
        openNowCount,
        openNowAvailable,
        openNowUnavailableLabel:
          subFiltered.length > 0
            ? `Current hours are available for ${decidedHoursCount.toLocaleString("en-US")} of ${subFiltered.length.toLocaleString("en-US")} matches.`
            : "Open-now filtering is unavailable until place hours are verified.",
        dealsOn,
        dealsTodayCount,
        musicTonight,
        musicTonightCount,
        timeMode,
        timeModeExplicit,
        everythingCount: allPlaces.length,
        intentCounts,
        subCounts,
        eventWindowCounts: counts,
      }}
    />
  );
}
