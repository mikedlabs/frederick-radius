import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import {
  isFreshAqiObservation,
  pickWorstAqi,
  type AqiObservation,
} from "@/lib/integrations/airnow";
import { prioritizeAlerts } from "@/lib/alert-priority";

/**
 * Severe-weather constraint shared by recommendation surfaces.
 *
 * An alert banner or AQI badge is not enough if the next card still sends
 * somebody to a pool, playground, trail, or skate park. Active NWS hazards and
 * fresh measured Code Red-or-worse air put outdoor discovery on hold.
 */
export type OutdoorSafetyHold = {
  kind: "nws" | "air-quality" | "unavailable";
  alert?: NwsAlert;
  observation?: AqiObservation;
  event: string;
  reason: string;
  url: string;
  endsAt?: string;
  unavailableFeeds?: Array<"weather alerts" | "air quality">;
};

export const AIRNOW_FREDERICK_URL = "https://www.airnow.gov/?city=Frederick&state=MD&country=USA";

const DIRECT_HAZARD_RE = /\b(?:tornado|severe thunderstorm|flash flood|flood (?:warning|watch|advisory)|lightning)\b/i;
const LIGHTNING_DANGER_RE = /\b(?:frequent|dangerous|continuous|cloud[- ]to[- ]ground) lightning\b|\blightning (?:is occurring|is expected|may occur)\b|\bmove indoors\b/i;
const DANGEROUS_AIR_RE = /\b(?:code\s+(?:red|purple|maroon)|very unhealthy|hazardous|unhealthy for (?:the )?general population)\b/i;

export function isOutdoorDangerAlert(alert: NwsAlert): boolean {
  const eventAndHeadline = `${alert.event} ${alert.headline}`;
  const fullText = `${eventAndHeadline} ${alert.description}`;
  if (DIRECT_HAZARD_RE.test(eventAndHeadline)) return true;
  if (/\b(?:air quality|smoke|ozone|particulate)\b/i.test(fullText) && DANGEROUS_AIR_RE.test(fullText)) return true;
  return LIGHTNING_DANGER_RE.test(alert.description);
}

/** Worst active outdoor hazard, or null when no blanket hold is warranted. */
export function outdoorSafetyHold(
  alerts: readonly NwsAlert[],
  airObservations: readonly AqiObservation[] = [],
  now: Date = new Date(),
): OutdoorSafetyHold | null {
  const nowMs = now.getTime();
  const activeDangerAlerts = alerts.filter((item) => {
      const startsAt = Date.parse(item.starts_at);
      const endsAt = Date.parse(item.ends_at);
      return (!Number.isFinite(startsAt) || startsAt <= nowMs) &&
        (!Number.isFinite(endsAt) || endsAt > nowMs);
    })
    .filter(isOutdoorDangerAlert);
  const alert = prioritizeAlerts(activeDangerAlerts)[0];
  if (alert) {
    return {
      kind: "nws",
      alert,
      event: alert.event,
      reason: `${alert.event} is active for Frederick County.`,
      url: alert.url,
      endsAt: alert.ends_at,
    };
  }

  // A fresh measured Code Red-or-worse observation is enough to stop an
  // outdoor recommendation even when no NWS/MDE alert product has arrived.
  // Code Orange remains sensitive-group guidance rather than a blanket hold.
  const freshAir = airObservations.filter((observation) => isFreshAqiObservation(observation, now));
  const worstAir = pickWorstAqi(freshAir);
  if (!worstAir || (worstAir.aqi < 151 && worstAir.category.id < 4)) return null;
  return {
    kind: "air-quality",
    observation: worstAir,
    event: "Unhealthy air quality",
    reason: `AirNow reports AQI ${worstAir.aqi}, ${worstAir.category.name}, for ${worstAir.reportingArea}.`,
    url: AIRNOW_FREDERICK_URL,
  };
}

const OUTDOOR_CATEGORIES = new Set([
  "outdoors",
  "park",
  "trail",
  "playground",
  "golf",
  "agritourism",
]);

const OUTDOOR_NAME_RE = /\b(?:skate ?park|outdoor (?:pool|amphitheater|venue)|swimming pool|municipal pool|community pool|hiking trail)\b/i;

/**
 * Conservative recommendation classifier. Category-derived `outdoor` tags are
 * the strongest signal; the name fallback catches records such as public pools
 * whose broad catalog category is not itself outdoor.
 */
export function isOutdoorRecommendation(value: {
  category?: string | null;
  name?: string | null;
  tags?: readonly string[] | null;
}): boolean {
  if (value.tags?.some((tag) => tag.toLowerCase() === "outdoor")) return true;
  if (value.category && OUTDOOR_CATEGORIES.has(value.category.toLowerCase())) return true;
  return OUTDOOR_NAME_RE.test(value.name ?? "");
}
