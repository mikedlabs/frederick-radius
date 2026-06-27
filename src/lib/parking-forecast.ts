import { haversineMeters } from "@/lib/geo";

/**
 * Predictive parking guidance — no live feed required.
 *
 * Frederick has no free public live-occupancy feed (the real-time layer lives
 * in the ParkZen-powered Park Frederick app). But we already know two things
 * that predict a full garage: a crowd-drawing event downtown, and which garage
 * sits closest to it. So before a downtown event starts, we can push a calm
 * local-expert heads-up: "the closest deck usually fills, try these two."
 *
 * This is a PREDICTION, framed honestly as one ("usually fills"), never a live
 * count. It needs only data we already hold: the unified event set (geo + time
 * + category) and the five garage coordinates. Pure + deterministic so it's
 * unit-tested; the cron is a thin wrapper that fans the results out to push.
 */

export type ForecastEvent = {
  slug: string;
  title: string;
  starts_at: string;
  geom?: { lng: number; lat: number } | null;
  category?: string;
};

export type ForecastGarage = {
  slug: string;
  name: string;
  geom?: { lng: number; lat: number };
};

export type ParkingForecast = {
  event: ForecastEvent;
  /** The closest garage — the one that tends to fill first. */
  primaryGarage: ForecastGarage;
  /** The next-closest garages to suggest as backups (names). */
  alternatives: string[];
  /** Stable per-event-per-day key so the alert fires once, not every tick. */
  dedupeKey: string;
};

// Fire when the event starts within this window. The lower bound sits above the
// cron interval so an event is still ahead of the user; the upper bound is the
// "time to decide where to park" lead. With a 30-min cron, an event gets a few
// ticks inside the window and the push dedupe collapses them to one send.
export const FORECAST_LEAD_MIN_MINUTES = 45;
export const FORECAST_LEAD_MAX_MINUTES = 150;
// The closest garage must be at least this near, i.e. the event is genuinely
// downtown. Anything farther isn't a garage-parking situation.
export const GARAGE_NEAR_METERS = 600;

// Categories whose events actually fill downtown decks. Daytime errands
// (a library talk, a government meeting) don't, so they're left out. Tunable.
const DRAW_CATEGORIES = new Set([
  "music",
  "festival",
  "theater",
  "arts",
  "food",
  "nightlife",
  "community",
  "sports",
  "market",
  "family",
]);

/** Eastern-clock-agnostic day stamp for the dedupe key (UTC date is fine: the
 *  lead window keeps `now` on the event's day). */
function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Does this event predict a parking crunch right now? */
export function eventDrawsParking(e: ForecastEvent, now: Date): boolean {
  if (!e.geom) return false;
  if (!DRAW_CATEGORIES.has(e.category ?? "")) return false;
  const start = Date.parse(e.starts_at);
  if (!Number.isFinite(start)) return false;
  const mins = (start - now.getTime()) / 60_000;
  return mins >= FORECAST_LEAD_MIN_MINUTES && mins <= FORECAST_LEAD_MAX_MINUTES;
}

/** Garages ranked nearest-first to a point (only those with coordinates). */
export function rankGaragesByDistance(
  geom: { lng: number; lat: number },
  garages: ForecastGarage[],
): Array<{ garage: ForecastGarage; meters: number }> {
  return garages
    .filter((g) => g.geom)
    .map((g) => ({ garage: g, meters: haversineMeters(geom, g.geom!) }))
    .sort((a, b) => a.meters - b.meters);
}

/**
 * Build the parking forecasts for the eligible events: one per crowd-drawing
 * downtown event in the lead window whose nearest garage is genuinely close.
 */
export function parkingForecasts(
  events: ForecastEvent[],
  garages: ForecastGarage[],
  now: Date,
): ParkingForecast[] {
  const out: ParkingForecast[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.slug)) continue;
    if (!eventDrawsParking(e, now)) continue;
    const ranked = rankGaragesByDistance(e.geom!, garages);
    if (!ranked.length || ranked[0].meters > GARAGE_NEAR_METERS) continue;
    seen.add(e.slug);
    out.push({
      event: e,
      primaryGarage: ranked[0].garage,
      alternatives: ranked.slice(1, 3).map((r) => r.garage.name),
      dedupeKey: `forecast:${e.slug}:${dayStamp(now)}`,
    });
  }
  return out;
}
