import type { LngLat } from "@/lib/geo";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getAirQuality, type AqiObservation } from "@/lib/integrations/airnow";
import { getNwsAlertsResult, type NwsAlertsResult } from "@/lib/integrations/nws-alerts";
import {
  AIRNOW_FREDERICK_URL,
  outdoorSafetyHold,
  type OutdoorSafetyHold,
} from "@/lib/weather-safety";
import { createSingleFlight } from "@/lib/single-flight";

type LiveSafetyOptions = {
  deadlineMs?: number;
  now?: Date;
};

const loadSafetyOnce = createSingleFlight<string, OutdoorSafetyHold | null>();

function within<T>(promise: Promise<T>, deadlineMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), deadlineMs);
  });
  return Promise.race([promise.catch(() => fallback), timeout])
    .finally(() => clearTimeout(timer));
}

/**
 * One bounded live safety read for every recommendation surface. NWS and
 * AirNow run together, so adding measured AQI does not turn into a second
 * sequential wait on Ask or Today.
 */
export async function loadOutdoorSafetyHold(
  point: LngLat = FREDERICK_CENTER,
  { deadlineMs = 2_500, now = new Date() }: LiveSafetyOptions = {},
): Promise<OutdoorSafetyHold | null> {
  // Today renders several recommendation surfaces concurrently. Coalesce
  // their identical safety read while it is in flight; the minute bucket is
  // precise enough for hourly AQI and active-alert guidance, and entries are
  // removed as soon as the work settles.
  const minute = Math.floor(now.getTime() / 60_000);
  const key = `${point.lat.toFixed(4)}:${point.lng.toFixed(4)}:${deadlineMs}:${minute}`;
  return loadSafetyOnce(key, async () => {
    const [alertResult, observations] = await Promise.all([
      within<NwsAlertsResult>(
        getNwsAlertsResult(),
        deadlineMs,
        { alerts: [], available: false },
      ),
      within<AqiObservation[] | null>(
        getAirQuality(point, { deadlineMs }),
        deadlineMs,
        null,
      ),
    ]);
    const hold = outdoorSafetyHold(
      alertResult.alerts,
      observations ?? [],
      new Date(minute * 60_000),
    );
    // A real hazard wins even if the second provider timed out. Otherwise an
    // empty failed response must never be treated as an all-clear.
    if (hold) return hold;

    const unavailableFeeds: Array<"weather alerts" | "air quality"> = [];
    if (!alertResult.available) unavailableFeeds.push("weather alerts");
    if (observations === null) unavailableFeeds.push("air quality");
    if (unavailableFeeds.length === 0) return null;

    const reason = unavailableFeeds.length === 2
      ? "Current weather alerts and air quality could not be verified."
      : `${unavailableFeeds[0] === "weather alerts" ? "Current weather alerts" : "Current air quality"} could not be verified.`;
    return {
      kind: "unavailable",
      event: "Outdoor safety check unavailable",
      reason,
      url: unavailableFeeds.length === 2
        ? "/pulse"
        : unavailableFeeds[0] === "weather alerts"
          ? "https://www.weather.gov/"
          : AIRNOW_FREDERICK_URL,
      unavailableFeeds,
    };
  });
}
