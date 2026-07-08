"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import AppMapClient, {
  type CivicPin,
  type EventPin,
  type MapLineFC,
  type CemeteryPin,
} from "@/components/map/AppMapClient";
import type { MapPinPlace } from "@/components/map/types";
import type { OsmPlace } from "@/lib/integrations/overpass";
import type { Amenity } from "@/lib/loaders/amenities";
import { AMENITY_GROUPS } from "@/components/map/constants";
import { defaultTimeMode, type TimeMode } from "@/components/map/dockCaption";
import { INTENTS, INTENT_BY_KEY, type IntentKey } from "@/data/intents";
import { isOpenNow } from "@/lib/hours";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";
import { buildHorizonBounds } from "@/lib/eventHorizon";

/**
 * BrowseMapClient — the param-dependent half of /map's browse mode.
 *
 * Everything here used to run server-side in the page, which forced the
 * whole route dynamic (reading `searchParams` opts a Next 16 route out
 * of ISR). The server now ships the UNFILTERED data — all places (pins
 * are clustered, so "everything" is the designed default anyway), the
 * civic/amenity/line layers, and the next week's mappable events — and
 * this component applies the URL-driven view on the client:
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
 * The one clock nuance: `now` is the BROWSER clock, captured once per
 * mount (the app template remounts per navigation, so this matches the
 * old per-request freshness — and beats it once the page is ISR-stale).
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
): (startsAt: string, endsAt?: string) => boolean {
  const nowMs = now.getTime();
  if (mode === "now") {
    const horizon = nowMs + 90 * 60_000;
    return (s, e) => {
      const sMs = Date.parse(s);
      const eMs = e ? Date.parse(e) : sMs;
      if (!Number.isFinite(sMs)) return false;
      return (sMs <= nowMs && eMs >= nowMs) || (sMs >= nowMs && sMs <= horizon);
    };
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
  places: allPlaces,
  civic,
  amenities,
  extraAmenities,
  trailLines,
  transitLines,
  municipalBoundaries,
  countyBoundary,
  cemeteries,
  weekEvents,
}: {
  /** ALL pin-slim places (unfiltered; open_status baked per ISR render). */
  places: MapPinPlace[];
  civic: CivicPin[];
  amenities: Amenity[];
  extraAmenities: OsmPlace[];
  trailLines: MapLineFC;
  transitLines: MapLineFC;
  municipalBoundaries: MapLineFC;
  countyBoundary: MapLineFC;
  cemeteries: CemeteryPin[];
  /** Draw-only, geolocated events for the next ~7 days, pre-shaped as
   *  pins server-side. This component windows them per ?t=. */
  weekEvents: EventPin[];
}) {
  const sp = useSearchParams();
  const intentParam = sp.get("intent") ?? undefined;
  const subParam = sp.get("sub") ?? undefined;
  const tParam = sp.get("t") ?? undefined;
  const openParam = sp.get("open") ?? undefined;
  const atParam = sp.get("at") ?? undefined;
  const amenityParam = sp.get("amenity") ?? undefined;

  // One clock per mount (see the doc comment above).
  const [now] = useState(() => new Date());

  // Deep-link a specific amenity layer on (/map?amenity=restroom,water).
  // Validate against the real tray group keys so a junk param can't
  // activate a nonexistent layer; undefined → clean map as before.
  const validAmenityGroups = new Set(AMENITY_GROUPS.map((g) => g.key));
  const initialAmenityGroups = amenityParam
    ? amenityParam.split(",").map((s) => s.trim()).filter((k) => validAmenityGroups.has(k))
    : undefined;

  // Deep-link camera: /map?at=lat,lng. Parse + sanity-bound to Frederick
  // County (a bad coord falls through to the county default). Returns
  // [lng, lat] for Mapbox; the row emits lat,lng.
  const initialCenter = ((): [number, number] | undefined => {
    if (!atParam) return undefined;
    const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(atParam.trim());
    if (!m) return undefined;
    const lat = +m[1];
    const lng = +m[2];
    if (lat < 38.8 || lat > 39.9 || lng < -77.9 || lng > -76.9) return undefined;
    return [lng, lat];
  })();

  const intent =
    intentParam && intentParam in INTENT_BY_KEY
      ? INTENT_BY_KEY[intentParam as IntentKey]
      : null;
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
  const openNow = openParam === "now";
  const openNowCount = subFiltered.filter((p) => isOpenNow(p.open_status)).length;
  const places = openNow
    ? subFiltered.filter((p) => isOpenNow(p.open_status))
    : subFiltered;

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
    counts[mode] = weekEvents.filter((e) => pred(e.starts_at, e.ends_at)).length;
  }
  const timeModeExplicit = isTimeMode(tParam);
  const timeMode: TimeMode = timeModeExplicit ? tParam : defaultTimeMode(counts);

  const matchTime = eventTimePredicate(timeMode, now);
  const seenCells = new Set<string>();
  const events: EventPin[] = [];
  for (const e of weekEvents) {
    if (!matchTime(e.starts_at, e.ends_at)) continue;
    // One pin per ~11m cell so stacked venue listings don't shingle.
    const cell = `${e.lat.toFixed(4)}:${e.lng.toFixed(4)}`;
    if (seenCells.has(cell)) continue;
    seenCells.add(cell);
    events.push(e);
    if (events.length >= 80) break;
  }

  // Per-intent counts over the unfiltered pool — the What pane's chips.
  // ~12 single-pass filters over ~1,700 pin records; cheap, and this
  // component only re-renders when the URL view changes.
  const intentCounts: Record<string, number> = {};
  for (const i of INTENTS) intentCounts[i.key] = allPlaces.filter(i.match).length;

  return (
    <AppMapClient
      places={places}
      civic={civic}
      extraAmenities={extraAmenities}
      amenities={amenities}
      trailLines={trailLines}
      transitLines={transitLines}
      municipalBoundaries={municipalBoundaries}
      countyBoundary={countyBoundary}
      cemeteries={cemeteries}
      events={events}
      fullBleed
      // Arriving via a category tile (?intent=…): center on the user's
      // known location and measure from there.
      recenterToKnownLocation={Boolean(intent)}
      // Show the county by default — never an empty map. The curated
      // places ride a CLUSTERED source, so "all ~1,700" reads as tidy
      // numbered bubbles; the dock REFINES rather than gates.
      pinpointDefault={false}
      initialCenter={initialCenter}
      initialAmenityGroups={initialAmenityGroups}
      // The map dock (MapDock) — the one instrument that replaced the
      // intent banner, sub strip, Open-now pill, and Layers drawer. The
      // dock writes the same URL params this component reads.
      dock={{
        intentKey: intent?.key,
        subKey: activeSub?.key,
        openNow,
        openNowCount,
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
