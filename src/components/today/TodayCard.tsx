import {
  getNwsForecast,
  iconForShortForecast,
  type NwsForecast,
} from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import { weatherVerdict } from "@/lib/weather-verdict";
import { getNwsAlertsResult, type NwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { getAirQuality, isFreshAqiObservation, pickWorstAqi } from "@/lib/integrations/airnow";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import OfflineTodayCapture from "@/components/pwa/OfflineTodayCapture";
import { easternDayKey } from "@/lib/tz";
import { withDeadlineFallback } from "@/lib/promise-deadline";

/** The glance is not a live-feed loading screen. Cached safety data is
 * normally immediate. A cold provider gets enough time to produce a trustworthy
 * first read inside the page's streaming boundary; a degraded provider still
 * collapses to an explicit unavailable note. */
export const TODAY_SAFETY_GLANCE_DEADLINE_MS = 2_500;

/**
 * TodayCard is the content of Today's one weather row.
 *
 * The page wraps it in a single link to the full forecast (/pulse?open=weather)
 * and supplies the row's rule and chevron. This component fills it with what
 * the National Weather Service actually reported, left to right:
 *
 *   [sky glyph]  62°  Clear · High 76° · Low 55°
 *
 * Every piece is optional and simply absent when the forecast does not carry
 * it, so the row never prints a default or a guess. The sky glyph follows the
 * current condition and the real sun times. It used to be a sunken card with a
 * headline, a 40px temperature, a sun-event line and a live daylight counter;
 * the briefing above it now carries the decisions, so weather is one line.
 *
 * Safety still outranks the line. An active NWS alert or an unhealthy air
 * reading adds one plain sentence from the shared verdict engine
 * (lib/weather-verdict), the same read the rest of the app shows. Server
 * component; the NWS fetch is shared and cached with the rest of the page.
 */

/** A feed miss should not turn Today's most valuable screen space into a large
 * failed weather card. The surrounding row remains a real link to Pulse, but
 * the failure itself is one honest sentence. */
export function WeatherUnavailable() {
  return (
    <div
      data-weather-state="unavailable"
      className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3"
    >
      <span className="text-meta-lg font-medium" style={{ color: "var(--app-ink-2)" }}>
        The NWS forecast is briefly unavailable.
      </span>
      <span className="text-meta-lg font-semibold" style={{ color: "var(--app-brand-press)" }}>
        County status
      </span>
    </div>
  );
}

export function compactWeatherRead({
  verdict,
  condition,
  alertsAvailable,
  airQualityAvailable,
  activeAlertCount,
  airQualityIndex,
}: {
  verdict: string;
  condition: string;
  alertsAvailable: boolean;
  airQualityAvailable: boolean;
  activeAlertCount: number;
  airQualityIndex: number | null;
}): { headline: string; safetyNote: string | null } {
  const safetyFeedsIncomplete = !alertsAvailable || !airQualityAvailable;
  const hasActionableSafetySignal =
    activeAlertCount > 0 ||
    (airQualityIndex !== null && airQualityIndex > 100);

  if (
    safetyFeedsIncomplete &&
    !hasActionableSafetySignal &&
    condition.trim()
  ) {
    const safetyNote =
      !alertsAvailable && !airQualityAvailable
        ? "Weather-alert and air-quality checks are unavailable."
        : !alertsAvailable
          ? "The weather-alert feed is unavailable."
          : "The air-quality reading is unavailable.";
    return {
      headline: sentenceCaseForecast(condition),
      safetyNote,
    };
  }

  return { headline: verdict, safetyNote: null };
}

/** NWS short forecasts arrive in headline case. In a sentence-scale weather
 * read that makes ordinary conditions look like a generated title, so present
 * the provider text as natural sentence case without changing its meaning. */
export function sentenceCaseForecast(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "";
}

export type WeatherRowFacts = {
  /** The current hour's temperature, or null when the hourly feed is empty. */
  temperature: number | null;
  /** The current hour's condition in sentence case ("Mostly sunny"). */
  condition: string | null;
  /** Today's daytime high, only while today's daytime period is listed. */
  high: number | null;
  /** The coming night's low (tonight, or the overnight period after midnight). */
  low: number | null;
};

/**
 * The facts the weather row may print, read only from the NWS forecast.
 *
 * NWS drops a period once it ends, so after the afternoon the first daytime
 * period belongs to tomorrow. Calling that "High" on tonight's row would
 * mislabel tomorrow's number as today's, so the high is kept only when its
 * period starts on today's Eastern date, and otherwise left out. The low is
 * the first night period, which is always the next one to come.
 */
export function weatherRowFacts(
  forecast: NwsForecast | null,
  now: Date,
): WeatherRowFacts {
  const current = forecast?.hourly?.[0] ?? null;
  const daily = forecast?.daily ?? [];
  const today = easternDayKey(now);
  const highPeriod = daily.find(
    (period) =>
      period.isDaytime === true &&
      easternDayKey(new Date(period.startTime)) === today,
  );
  const lowPeriod = daily.find((period) => period.isDaytime === false);
  const finite = (value: number | undefined | null) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const condition = current?.shortForecast
    ? sentenceCaseForecast(current.shortForecast)
    : "";
  return {
    temperature: finite(current?.temperature),
    condition: condition || null,
    high: finite(highPeriod?.temperature),
    low: finite(lowPeriod?.temperature),
  };
}

/** "Clear · High 76° · Low 55°", leaving out whatever the forecast lacks. */
export function weatherRowLine(facts: WeatherRowFacts): string | null {
  const parts = [
    facts.condition,
    facts.high != null ? `High ${facts.high}°` : null,
    facts.low != null ? `Low ${facts.low}°` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function TodayCard() {
  const now = new Date();

  // Weather alone cannot authorize "great time to get out." Fetch the official
  // alert feed and current AQI beside it, with short ceilings so a slow safety
  // provider never holds the row hostage. A failed alert feed is carried
  // forward explicitly; the verdict then falls back to neutral copy.
  const [forecast, alertResult, airObservations] = await Promise.all([
    withDeadlineFallback(
      getNwsForecast(FREDERICK_CENTER),
      TODAY_SAFETY_GLANCE_DEADLINE_MS,
      null,
    ),
    withDeadlineFallback<NwsAlertsResult>(
      getNwsAlertsResult(),
      TODAY_SAFETY_GLANCE_DEADLINE_MS,
      { alerts: [], available: false },
    ),
    withDeadlineFallback(
      getAirQuality(FREDERICK_CENTER, {
        deadlineMs: TODAY_SAFETY_GLANCE_DEADLINE_MS,
      }),
      TODAY_SAFETY_GLANCE_DEADLINE_MS,
      null,
    ),
  ]);
  const cur = forecast?.hourly?.[0] ?? null;
  const condition = cur?.shortForecast ?? "";
  const facts = weatherRowFacts(forecast, now);
  const freshAir = (airObservations ?? []).filter((obs) => isFreshAqiObservation(obs, now));
  const worstAir = pickWorstAqi(freshAir);
  const airQualityAvailable = airObservations !== null && freshAir.length > 0;
  const hasSafetySignal =
    alertResult.alerts.length > 0 ||
    (worstAir !== null && worstAir.aqi > 100);

  // Alerts and measured air quality still deserve the row when the ordinary
  // forecast fails. If every live conditions feed is quiet or unavailable,
  // the row says the forecast is unavailable instead of manufacturing a
  // weather read from defaults.
  if (!cur && !hasSafetySignal) {
    return <WeatherUnavailable />;
  }

  // Always run the verdict: official alerts and AQI must still surface if the
  // ordinary forecast fails. Placeholder weather fields cannot produce a
  // positive read because weatherAvailable explicitly fails closed below.
  const verdict = weatherVerdict({
    temp: cur?.temperature ?? 70,
    shortForecast: cur?.shortForecast ?? "",
    precipNow: cur?.probabilityOfPrecipitation ?? 0,
    forecastHigh: facts.high,
    activeAlerts: alertResult.alerts,
    airQuality: worstAir ? { aqi: worstAir.aqi, category: worstAir.category.name } : null,
    airQualityParameters: freshAir.map((observation) => observation.parameter),
    alertsAvailable: alertResult.available,
    airQualityAvailable,
    weatherAvailable: Boolean(cur && forecast),
    hourly: forecast?.hourly ?? [],
    now,
  }).brief;
  const weatherRead = compactWeatherRead({
    verdict,
    condition,
    alertsAvailable: alertResult.available,
    airQualityAvailable,
    activeAlertCount: alertResult.alerts.length,
    airQualityIndex: worstAir?.aqi ?? null,
  });
  // Only an actionable signal earns words here. A quiet day's verdict would
  // repeat the condition, and a missing safety feed makes no claim on a row
  // that no longer offers advice.
  const safetySentence = hasSafetySignal ? verdict : null;

  // Daytime by real sun times (the glyph's sun or moon depends on it).
  const st = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  const isDay = st.sunrise && st.sunset ? now >= st.sunrise && now < st.sunset : true;
  const variant: SkyVariant | null = condition
    ? iconForShortForecast(condition, isDay)
    : null;
  const line = weatherRowLine(facts);

  return (
    // A div, because the sky glyph is one; the page's link around it is a
    // block-level row, where flow content is valid.
    <div data-weather-state="ready" className="flex min-w-0 flex-1 items-center gap-3">
      <OfflineTodayCapture
        snapshot={{
          dayKey: easternDayKey(now),
          weather: {
            headline: weatherRead.headline || condition,
            condition: condition || undefined,
            temperatureF: facts.temperature ?? undefined,
            highF: facts.high ?? undefined,
            safetyNote: weatherRead.safetyNote ?? undefined,
          },
        }}
      />
      <span className="sr-only">Countywide weather now: </span>
      {variant ? (
        <AnimatedSkyGlyph variant={variant} size={32} className="shrink-0" />
      ) : null}
      {facts.temperature != null ? (
        <span data-today-weather-temp className="text-title shrink-0 tabular-nums" style={{ color: "var(--app-ink)" }}>
          {facts.temperature}&deg;
        </span>
      ) : null}
      {line || safetySentence ? (
        <span className="min-w-0">
          {line ? (
            <span data-today-weather-line className="text-meta-lg block tabular-nums" style={{ color: "var(--app-ink-2)" }}>
              {line}
            </span>
          ) : null}
          {safetySentence ? (
            <span data-today-weather-safety className="text-meta-lg block font-semibold" style={{ color: "var(--app-ink)" }}>
              {safetySentence}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
