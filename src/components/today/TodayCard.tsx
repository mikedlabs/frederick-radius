import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import DaylightLeftInline from "@/components/today/DaylightLeftInline";
import { weatherVerdict } from "@/lib/weather-verdict";
import { getNwsAlertsResult, type NwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { getAirQuality, isFreshAqiObservation, pickWorstAqi } from "@/lib/integrations/airnow";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import OfflineTodayCapture from "@/components/pwa/OfflineTodayCapture";
import { easternDayKey } from "@/lib/tz";
import { withDeadlineFallback } from "@/lib/promise-deadline";

/** The hero is a glance, not a live-feed loading screen. Cached safety data is
 * normally immediate. A cold provider gets enough time to produce a trustworthy
 * first read inside the page's streaming boundary; a degraded provider still
 * collapses to an explicit unavailable note. */
export const TODAY_SAFETY_GLANCE_DEADLINE_MS = 2_500;

/**
 * TodayCard — the daily hook at the very top of /now.
 *
 * The product thesis is "less list, more lens": within a few seconds a
 * stranger should get a win and understand why this app exists. This
 * card is that moment. It turns the data the page already has — weather
 * now, today's high, sunset, and tonight's headline event — into one
 * editorial readout plus two situational next-steps, instead of making
 * the user assemble it from scattered modules.
 *
 *   Frederick today
 *   Good morning. Patio weather.
 *   70° now · High 76° · Sunset 8:27 PM
 *   Tonight: Alive @ Five at Carroll Creek
 *   [ Find coffee → ]  [ Open map ]
 *
 * Renders ON the SkyHero gradient (tone-aware via currentColor), so it
 * IS the hero rather than a card stacked on top of one. Server
 * component; the NWS fetch is shared/cached with the rest of the page.
 */

// The weather read beside the greeting comes from lib/weather-verdict —
// the SAME engine NowIntel uses — so the hero and the "right now" line
// can never disagree about one sky in one viewport. (This card used to
// carry its own moodLine() with a fog branch the shared engine lacked;
// the 4:18 AM audit caught "Low and gray." here over "A fine day to get
// out." below. One engine owns the read now.)

function fmtTime(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** A feed miss should not turn Today's most valuable screen space into a large
 * failed weather card. The surrounding weather plate remains a real link to
 * Pulse, but the failure itself collapses to one honest, useful row. */
export function WeatherUnavailable() {
  return (
    <section
      aria-label="Weather unavailable"
      data-weather-state="unavailable"
      className="flex min-h-11 items-center justify-between gap-3 pr-5"
      style={{ color: "currentColor" }}
    >
      <span className="text-[12.5px] font-medium">The NWS forecast is briefly unavailable.</span>
      <span className="shrink-0 text-[11.5px] font-semibold opacity-80">
        County status
      </span>
    </section>
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

export default async function TodayCard() {
  const now = new Date();

  // Weather alone cannot authorize "great time to get out." Fetch the official
  // alert feed and current AQI beside it, with short ceilings so a slow safety
  // provider never holds the whole hero hostage. A failed alert feed is carried
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
  const tempNow = cur?.temperature ?? null;
  const condition = cur?.shortForecast ?? "";
  const high = forecast?.daily?.find((p) => p.isDaytime)?.temperature ?? null;
  const freshAir = (airObservations ?? []).filter((obs) => isFreshAqiObservation(obs, now));
  const worstAir = pickWorstAqi(freshAir);
  const airQualityAvailable = airObservations !== null && freshAir.length > 0;
  const hasSafetySignal =
    alertResult.alerts.length > 0 ||
    (worstAir !== null && worstAir.aqi > 100);

  // Alerts and measured air quality still deserve the top slot when the
  // ordinary forecast fails. If every live conditions feed is quiet or
  // unavailable, collapse to the small handoff above instead of manufacturing
  // a weather read from defaults.
  if (!cur && !hasSafetySignal) {
    return <WeatherUnavailable />;
  }

  // The NEXT sun event, not both — sunrise if it hasn't happened yet,
  // otherwise tonight's sunset, otherwise tomorrow's sunrise. (Replaces
  // the redundant sunrise+sunset footer that duplicated this.)
  const st = sunTimes(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  let sun: { label: string; time: string } | null = null;
  if (st.sunrise && now < st.sunrise) {
    sun = { label: "Sunrise", time: fmtTime(st.sunrise)! };
  } else if (st.sunset && now < st.sunset) {
    sun = { label: "Sunset", time: fmtTime(st.sunset)! };
  } else {
    const tmrw = sunTimes(new Date(now.getTime() + 86_400_000), FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
    if (tmrw.sunrise) sun = { label: "Sunrise", time: fmtTime(tmrw.sunrise)! };
  }

  // Always run the verdict: official alerts/AQI must still surface if the
  // ordinary forecast fails. Placeholder weather fields cannot produce a
  // positive read because weatherAvailable explicitly fails closed below.
  // The hero takes the BRIEF (one observation), never the full advice
  // line — the greeting already spends words here, and the counsel lives
  // in NowIntel below (owner report, 2026-07-19: too much text up top).
  const verdict = weatherVerdict({
    temp: cur?.temperature ?? 70,
    shortForecast: cur?.shortForecast ?? "",
    precipNow: cur?.probabilityOfPrecipitation ?? 0,
    forecastHigh: high,
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

  // Daytime by real sun times (the glyph's sun/moon depends on it).
  const isDay = st.sunrise && st.sunset ? now >= st.sunrise && now < st.sunset : true;
  const variant: SkyVariant | null = condition
    ? iconForShortForecast(condition, isDay)
    : null;

  // Secondary stats — high + next sun event. The big temperature carries
  // "now," so it's dropped from this line to avoid saying it twice.
  const stats = cur
    ? [
        high != null ? `High ${high}°` : null,
        sun ? `${sun.label} ${sun.time}` : null,
      ].filter(Boolean)
    : [];

  return (
    <section aria-label="Today in Frederick" style={{ color: "currentColor" }}>
      <OfflineTodayCapture
        snapshot={{
          dayKey: easternDayKey(now),
          weather: {
            headline: weatherRead.headline || condition,
            condition: condition || undefined,
            temperatureF: tempNow ?? undefined,
            highF: high ?? undefined,
            safetyNote: weatherRead.safetyNote ?? undefined,
          },
        }}
      />
      {/* The hook — a concise weather read in the display face.
          The 3-second "I get it" line, now a tighter lead above one compact
          weather row (was a 28px headline stacked over a 64px number). */}
      {/* text-wrap balance: the two-line mood ("… chase shade and / AC.")
          otherwise strands its last word at narrow widths. */}
      {weatherRead.headline && (
        <h2 className="font-sans text-[18px] font-semibold leading-snug tracking-tight [text-wrap:balance] sm:text-[20px]">
          {weatherRead.headline}
        </h2>
      )}
      {weatherRead.safetyNote && (
        <p className="mt-1 text-[11.5px] font-medium">
          {weatherRead.safetyNote}
        </p>
      )}

      {/* One compact weather row: the animated glyph + the temperature + the
          high/sunset stats, side by side, so the header stays short. */}
      {(variant || tempNow != null || stats.length > 0) && (
        <div className="mt-2 flex items-center gap-3">
          {variant && (
            <AnimatedSkyGlyph variant={variant} size={44} className="shrink-0 opacity-95" />
          )}
          {tempNow != null && (
            <span className="font-sans text-[40px] font-light leading-none tracking-tight tabular-nums sm:text-[44px]">
              {tempNow}&deg;
            </span>
          )}
          {stats.length > 0 && (
            <span className="text-[12.5px] font-medium leading-snug tabular-nums">
              {stats.join("  ·  ")}
              {/* Live daylight-left, moved here from TodayContext (client-side
                  so it stays accurate; the server card would freeze it). */}
              <DaylightLeftInline />
            </span>
          )}
        </div>
      )}

      {/* The selected event lead renders once in the Events today section. */}
    </section>
  );
}
