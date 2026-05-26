import type { Metadata } from "next";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { allAmenities, dedupeAmenities } from "@/lib/loaders/amenities";
import { allUpcoming } from "@/lib/loaders/events";
import AppMapClient, { type CivicPin, type EventPin } from "@/components/map/AppMapClient";
import MapIntentChips from "@/components/map/MapIntentChips";
import MapTimeChips, { type TimeMode } from "@/components/map/MapTimeChips";
import { INTENT_BY_KEY, type IntentKey } from "@/data/intents";
import { CATEGORY_BY_SLUG } from "@/data/categories";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

const OPEN_PLACES = publicPlaces().map((p) => decoratePlace(p));

export const metadata: Metadata = {
  title: "Map · Frederick County",
  description:
    "The full panable map of Frederick County. Filter by what you're doing. Coffee, food, wineries, breweries, outdoors, family, arts, civic.",
};

export const revalidate = 300;

/**
 * /map — the map IS the page.
 *
 * A user who taps "Map" expects a map, not a directory. The map paints
 * full-bleed under the chrome with the intent chip strip pinned to the
 * top so filtering is one tap away. The synced "in view" list lives in
 * the bottom drawer (peek by default). Discover-style intent depth is
 * still reachable via the chips — colored, iconned, and recognizable.
 */
/**
 * Decide which event-time window the map shows. The brief's "time is
 * a first-class dimension" rule: every event surface gets a temporal
 * lens. Returns a predicate so the seed loop stays a single pass.
 *
 * Modes:
 *   - "now":     live right now (start ≤ now ≤ end) OR starting in the
 *                next 90 minutes
 *   - "tonight": starting between now (clamped to today 16:00 ET) and
 *                tomorrow 02:30 ET — so "tonight" still means "tonight"
 *                at 11pm, and not "yesterday"
 *   - "weekend": Friday 17:00 ET → Monday 00:00 ET of the next weekend
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
      // Live now OR starting in the next 90 min
      return (sMs <= nowMs && eMs >= nowMs) || (sMs >= nowMs && sMs <= horizon);
    };
  }
  if (mode === "tonight") {
    // Anchor "tonight" in Eastern time so the same definition holds
    // for a Vercel UTC server and a Frederick user. 16:00 ET = 21:00
    // UTC (or 20:00 UTC during EDT — close enough for a coarse map
    // filter; the seed events themselves are precise.)
    const today = new Date(now);
    today.setHours(16, 0, 0, 0);
    const start = Math.max(nowMs, today.getTime());
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 30, 0, 0);
    const end = tomorrow.getTime();
    return (s) => {
      const sMs = Date.parse(s);
      return Number.isFinite(sMs) && sMs >= start && sMs <= end;
    };
  }
  if (mode === "weekend") {
    const dow = now.getDay();
    const friday = new Date(now);
    friday.setDate(friday.getDate() + ((5 - dow + 7) % 7));
    friday.setHours(17, 0, 0, 0);
    const monday = new Date(friday);
    monday.setDate(monday.getDate() + 3);
    monday.setHours(0, 0, 0, 0);
    const fMs = friday.getTime();
    const mMs = monday.getTime();
    return (s) => {
      const sMs = Date.parse(s);
      return Number.isFinite(sMs) && sMs >= fMs && sMs <= mMs;
    };
  }
  // "all" — next 7 days. The cap is applied in the caller's loop.
  const horizon = nowMs + 7 * 24 * 3_600_000;
  return (s) => {
    const sMs = Date.parse(s);
    return Number.isFinite(sMs) && sMs >= nowMs && sMs <= horizon;
  };
}

function isTimeMode(s: string | undefined): s is TimeMode {
  return s === "now" || s === "tonight" || s === "weekend" || s === "all";
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; t?: string }>;
}) {
  const [
    { intent: intentParam, t: tParam },
    incidents,
    fixit,
    mapillaryTrash,
    trailLines,
    transitLines,
  ] = await Promise.all([
    searchParams,
    getChartIncidentsFrederick().catch(() => []),
    getFixItIssues(30).catch(() => []),
    fetchMapillaryTrash().catch(() => []),
    getFrederickTrailShapes().catch(() => EMPTY_FC),
    getFrederickTransitRouteShapes().catch(() => EMPTY_FC),
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

  const amenities = dedupeAmenities(
    allAmenities(),
    OPEN_PLACES.map((p) => ({ name: p.name, category: p.category, geom: p.geom })),
  );

  const intent =
    intentParam && intentParam in INTENT_BY_KEY
      ? INTENT_BY_KEY[intentParam as IntentKey]
      : null;
  const places = intent ? OPEN_PLACES.filter(intent.match) : OPEN_PLACES;

  // Events as map pins, scoped to the active temporal window. The
  // brief's "what's happening now / tonight / this weekend" filter
  // lives in the ?t= search param; default is "tonight" so the map
  // answers the most common question on first open.
  const timeMode: TimeMode = isTimeMode(tParam) ? tParam : "tonight";
  const now = new Date();
  const allWeek = allUpcoming(now, 200);
  // Pre-compute per-mode counts so the chip strip can show "Tonight · 3"
  // without forcing a click into an empty map.
  const counts: Partial<Record<TimeMode, number>> = {};
  for (const mode of ["now", "tonight", "weekend", "all"] as const) {
    const pred = eventTimePredicate(mode, now);
    counts[mode] = allWeek.filter((e) => pred(e.starts_at, e.ends_at)).length;
  }

  const matchTime = eventTimePredicate(timeMode, now);
  const inWindow = allWeek.filter((e) => matchTime(e.starts_at, e.ends_at));
  const seenCells = new Set<string>();
  const events: EventPin[] = [];
  for (const e of inWindow) {
    if (!Number.isFinite(e.geom?.lng) || !Number.isFinite(e.geom?.lat)) continue;
    const cell = `${e.geom.lat.toFixed(4)}:${e.geom.lng.toFixed(4)}`;
    if (seenCells.has(cell)) continue;
    seenCells.add(cell);
    events.push({
      slug: e.slug,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      venue_name: e.venue_name,
      lng: e.geom.lng,
      lat: e.geom.lat,
      category: e.category,
      category_color: CATEGORY_BY_SLUG[e.category]?.color,
      hero_image: e.hero_image,
    });
    if (events.length >= 80) break;
  }

  return (
    <div
      className="-mx-4 -mt-4 relative"
      style={{
        marginBottom: "calc(-6rem - env(safe-area-inset-bottom, 0px))",
        height: "calc(100dvh - 56px - env(safe-area-inset-top, 0px))",
      }}
    >
      <MapIntentChips
        active={intent?.key}
        activeCount={intent ? places.length : undefined}
      />
      <MapTimeChips
        active={timeMode}
        intent={intent?.key}
        counts={counts}
      />
      <AppMapClient
        places={places}
        civic={civic}
        extraAmenities={mapillaryTrash}
        amenities={amenities}
        trailLines={trailLines}
        transitLines={transitLines}
        events={events}
        fullBleed
      />
    </div>
  );
}
