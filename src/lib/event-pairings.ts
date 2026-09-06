/**
 * Smart-pairing synthesizers for the event detail page.
 *
 * Per the mobile review (May 2026): the event detail page already
 * has the data joins (nearbyFood, nearbyParking, NWS forecast), but
 * it presents them as separate scattered sections at the bottom.
 * The reviewer's example pointed at the connective copy:
 *
 *   "Alive @ Five · 5pm at Carroll Creek · Weather looks good
 *    through sunset · Parking 200ft south · Eat at Cellar Door"
 *
 * These helpers produce ONE LINE each for the three signals so the
 * detail page can render a small `<EventSmartPairings>` card high up,
 * giving the user the entire decision context at a glance.
 *
 * Pure functions, isomorphic, no network. The component calling them
 * fetches NWS once and passes the forecast in.
 */

import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";
import type { PlaceCardData } from "@/lib/loaders/places";
import { formatDistance } from "@/lib/geo";
import {
  eventParkingSummary,
  type EventParkingDecision,
} from "@/lib/events/parking";

// ── Weather ───────────────────────────────────────────────────────

/**
 * Find the NWS hourly period that contains a given Date. NWS periods
 * are wall-clock-aligned with explicit startTime/endTime ISO strings.
 * Returns null when the event is outside the forecast horizon (the
 * hourly endpoint only covers ~7 days).
 */
export function findHourlyAt(
  forecast: NwsForecast | null,
  at: Date,
): NwsHourly | null {
  if (!forecast || !forecast.hourly || forecast.hourly.length === 0) return null;
  const t = at.getTime();
  if (!Number.isFinite(t)) return null;
  for (const h of forecast.hourly) {
    const s = Date.parse(h.startTime);
    const e = Date.parse(h.endTime);
    if (Number.isFinite(s) && Number.isFinite(e) && s <= t && t < e) {
      return h;
    }
  }
  return null;
}

/**
 * Synthesize a one-line weather phrase for an event start. Returns
 * null when no useful signal is available (event outside forecast
 * window, no data). Priority order:
 *
 *   1. Rain at start (precip ≥ 50% in the start hour)
 *   2. Cold (< 45°F)
 *   3. Hot (> 88°F)
 *   4. Clear + comfortable (60-82°F, clear/sunny/partly)
 *   5. Generic temp + cond fallback for anything else
 *
 * Editorial: the phrase should sound like local-paper copy, not
 * weather-channel copy. No "expected precipitation chance 60%" —
 * we just say "rain by start." Decision tool, not data dump.
 */
export function weatherPhrase(period: NwsHourly | null): string | null {
  if (!period) return null;
  const cond = (period.shortForecast || "").toLowerCase();
  const temp = period.temperature;
  const precip = period.probabilityOfPrecipitation ?? 0;
  const isRaining = /rain|shower|drizzle|storm|thunder/.test(cond);

  if (isRaining || precip >= 60) {
    if (/storm|thunder/.test(cond)) {
      return "Storms are possible when this event starts. Check the radar.";
    }
    return "Rain is expected when this event starts. Bring an umbrella.";
  }
  if (precip >= 40) {
    return `There is a chance of rain when this event starts, with a temperature near ${temp}°F.`;
  }
  if (temp <= 40) {
    return `It will be about ${temp}°F when this event starts. Bring layers.`;
  }
  if (temp <= 50 && /clear|sunny|fair/.test(cond)) {
    return `It should be clear and around ${Math.round(temp / 10) * 10}°F when this event starts. Bring a layer.`;
  }
  if (temp >= 90) {
    return `It will be about ${temp}°F when this event starts. Bring water.`;
  }
  if (temp >= 60 && temp <= 82 && /clear|sunny|fair|partly/.test(cond)) {
    return `Conditions should be ${cond}, with a temperature near ${temp}°F when this event starts.`;
  }
  // Generic fallback: still useful — names temp and condition.
  if (Number.isFinite(temp) && cond) {
    return `Conditions should be ${cond}, with a temperature near ${temp}°F when this event starts.`;
  }
  return null;
}

// ── Parking ───────────────────────────────────────────────────────

/**
 * Synthesize the parking phrase from the canonical event-detail garage
 * decision. The Getting there section receives the same decision, so one page
 * cannot advertise two different closest garages or distances.
 */
export function parkingPhrase(
  parking: EventParkingDecision | null,
): string | null {
  return eventParkingSummary(parking);
}

// ── Eat before ────────────────────────────────────────────────────

/**
 * Synthesize an "eat before" phrase from the pre-decorated nearby
 * food list. Names the single closest spot and counts the rest, so
 * the line reads as a recommendation rather than a list dump.
 */
export function eatBeforePhrase(nearbyFood: PlaceCardData[]): string | null {
  const lead = nearbyFood[0];
  if (!lead) return null;
  const d = lead.distance_m ?? Infinity;
  if (!Number.isFinite(d)) return null;
  const tail = nearbyFood.length - 1;
  const more = tail > 0
    ? ` There ${tail === 1 ? "is" : "are"} ${tail} more ${tail === 1 ? "option" : "options"} nearby.`
    : "";
  return `${lead.name} is ${formatDistance(d)} away in a straight line.${more} Check its hours for the event date.`;
}
