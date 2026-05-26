import Link from "next/link";
import {
  Wind,
  Droplets,
  Sunrise,
  Sunset,
} from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
// NWS alerts are rendered separately by CivicAlerts (promoted to the
// very top of /today in PR #100). We deliberately don't refetch them
// here — that was a duplicate fetch leftover from the earlier inline-
// alert design.
import { FREDERICK_CENTER } from "@/lib/geo";
import { weatherVerdict, nextWeatherChange } from "@/lib/weather-verdict";
import WeeklyForecast from "./WeeklyForecast";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import WeatherHourlyChart from "./WeatherHourlyChart";

/**
 * WeatherHero — the richer current-conditions module.
 *
 * Layered card over the SkyHero gradient. Shows: current temp + icon,
 * short forecast, today's high/low, precip chance, wind, a sun arc
 * with sunrise + sunset endpoints and a marker at the current sun
 * position, then a 6-hour mini-strip. NWS alerts get a stronger red
 * banner above the card when active.
 *
 * Replaces HomeWeatherStrip on the Today hero. The /pulse page still
 * owns the deep weather view; this is the at-a-glance read.
 */

const FREDERICK_LAT = 39.4143;
const FREDERICK_LNG = -77.4105;

// Reuse the same almanac math as SunCountdown but inline for two
// reasons: 1) we don't need to depend on the public SunCountdown
// surface, 2) we only need the rise/set Date objects on the server.
function sunTimes(date: Date, lat: number, lng: number) {
  const RAD = Math.PI / 180;
  const ZENITH = 90.833;
  const yyyy = date.getUTCFullYear();
  const mm = date.getUTCMonth();
  const dd = date.getUTCDate();
  const N = Math.floor(
    (Date.UTC(yyyy, mm, dd) - Date.UTC(yyyy, 0, 0)) / 86_400_000,
  );
  const lngHour = lng / 15;
  const calc = (rising: boolean): Date | null => {
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L =
      M +
      1.916 * Math.sin(M * RAD) +
      0.02 * Math.sin(2 * M * RAD) +
      282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * RAD)) / RAD;
    RA = ((RA % 360) + 360) % 360;
    const Lq = Math.floor(L / 90) * 90;
    const RAq = Math.floor(RA / 90) * 90;
    RA = (RA + (Lq - RAq)) / 15;
    const sinDec = 0.39782 * Math.sin(L * RAD);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH =
      (Math.cos(ZENITH * RAD) - sinDec * Math.sin(lat * RAD)) /
      (cosDec * Math.cos(lat * RAD));
    if (cosH > 1 || cosH < -1) return null;
    let H = rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD;
    H = H / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = ((T - lngHour) % 24 + 24) % 24;
    const dayOffset = !rising && UT < 12 ? 1 : rising && UT > 18 ? -1 : 0;
    const hours = Math.floor(UT);
    const minutes = Math.floor((UT - hours) * 60);
    return new Date(Date.UTC(yyyy, mm, dd + dayOffset, hours, minutes, 0));
  };
  const sunrise = calc(true);
  const sunset = calc(false);
  if (!sunrise || !sunset) return null;
  return { sunrise, sunset };
}

function clockLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function WeatherHero() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);

  const cur = forecast?.hourly?.[0] ?? null;
  // 12-hour chart — the NWS API caps us at 12 periods anyway, so this
  // is the full hourly outlook. The chart is space-efficient enough
  // to show all of them legibly without scroll.
  const next12 = forecast?.hourly?.slice(0, 12) ?? [];
  // Today's high/low — the first "isDaytime: true" daily period is
  // today's high (or tomorrow's if we're already past sunset; the
  // NWS API rolls over after dark). Same heuristic for low.
  const today = forecast?.daily ?? [];
  const todayDay = today.find((p) => p.isDaytime);
  const todayNight = today.find((p) => !p.isDaytime);
  const high = todayDay?.temperature;
  const low = todayNight?.temperature;
  const precip = cur?.probabilityOfPrecipitation ?? 0;

  const now = new Date();
  const sun = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);
  // Map current time to a 0-1 position along the daytime arc.
  let sunProgress = 0;
  if (sun) {
    const t = now.getTime();
    const a = sun.sunrise.getTime();
    const b = sun.sunset.getTime();
    sunProgress = Math.max(0, Math.min(1, (t - a) / (b - a)));
  }

  const curVariant: SkyVariant = cur ? iconForShortForecast(cur.shortForecast) : "Cloud";

  // Verdict — the one sentence that turns the forecast into a plan.
  const verdict = cur
    ? weatherVerdict({
        temp: cur.temperature,
        shortForecast: cur.shortForecast,
        precipNow: precip,
        hourly: forecast?.hourly ?? [],
        now,
      })
    : null;

  // Next change — Mercury Weather's editorial-second-line move.
  // Verdict is the mood; this is the heads-up. "Warming to 80° by
  // 4 PM" / "Rain starting around 5 PM" / "Steady through evening."
  const nextChange = cur && forecast?.hourly
    ? nextWeatherChange({ hourly: forecast.hourly, now })
    : null;
  const verdictColor =
    verdict?.tone === "rough"
      ? "var(--app-cool)"
      : verdict?.tone === "mixed"
        ? "var(--app-ink-2)"
        : "var(--app-ink)";

  // Brand-palette wash. The card lifts from flat paper to a quiet
  // gradient that carries a brand cue tied to the forecast — almanac
  // gold for a good day, Carroll Creek slate for a rough one, sage
  // for the in-between, paper-2 as the default. All tinted at 7-10%
  // over the paper-cream background so the card stays readable and
  // doesn't fight any content on top.
  const accentToken =
    verdict?.tone === "rough"
      ? "var(--app-cool)"
      : verdict?.tone === "mixed"
        ? "var(--app-sage)"
        : verdict?.tone === "good"
          ? "var(--app-accent)"
          : "var(--app-paper-2)";
  const heroBg = `linear-gradient(155deg, var(--app-bg-elevated) 0%, color-mix(in srgb, ${accentToken} 9%, var(--app-bg-elevated)) 100%)`;

  // Daylight remaining — more useful than a bare sunset clock for an
  // app about getting out tonight.
  let daylightNote: string | null = null;
  if (sun) {
    const msLeft = sun.sunset.getTime() - now.getTime();
    if (msLeft > 0) {
      const h = Math.floor(msLeft / 3_600_000);
      const m = Math.round((msLeft % 3_600_000) / 60_000);
      const left = h > 0 ? `${h}h ${m}m` : `${m}m`;
      daylightNote = `${left} of daylight · sunset ${clockLabel(sun.sunset)}`;
    } else {
      daylightNote = `Sunset was ${clockLabel(sun.sunset)}`;
    }
  }

  return (
    <article
      className="wx-hero tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)] p-4"
      style={{ background: heroBg }}
    >
      {/* Inline alert chip removed — the CivicAlerts component at the
          top of Today already shows the active NWS alert with the full
          headline, severity color, ends-at time, and scope chip. We
          were rendering the same Severe Thunderstorm Watch twice. */}
      {/*
        The hero is split: the "summary" top half is a Link to /pulse
        (the deep weather page), and the hourly chart + 7-day live
        outside that link so their interactive controls (tab buttons,
        show/hide toggle) don't have to fight a parent navigation
        intent. Putting buttons inside an <a> is invalid HTML and
        gives the user a janky double-action on every tap.
       */}
      <Link
        href="/pulse"
        aria-label="Current weather and today's outlook — open the full weather board"
        className="block transition active:scale-[0.995]"
      >
        {cur ? (
          <>
            {/* Top row: big temp + animated sky glyph + H/L + meta chips.
                The sky glyph replaces a flat Lucide icon — rays rotate,
                clouds drift, rain falls, snow drifts. Pure CSS, respects
                prefers-reduced-motion. */}
            <div className="flex items-start gap-3">
              <AnimatedSkyGlyph variant={curVariant} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p
                    className="font-serif text-[40px] font-semibold leading-none tabular-nums"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {cur.temperature}&deg;
                  </p>
                  {(high !== undefined || low !== undefined) && (
                    <p
                      className="text-[12px] font-semibold tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {high !== undefined && (
                        <>
                          H&nbsp;<span style={{ color: "var(--app-ink-2)" }}>{high}&deg;</span>
                        </>
                      )}
                      {low !== undefined && (
                        <>
                          &nbsp;&middot;&nbsp;L&nbsp;<span style={{ color: "var(--app-ink-2)" }}>{low}&deg;</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <p
                  className="mt-0.5 truncate text-[13px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {cur.shortForecast}
                </p>
                {/* Verdict — the forecast turned into a plan. The
                    editorial line, weighted to read as the takeaway. */}
                {verdict && (
                  <p
                    className="mt-1 text-[13.5px] font-semibold leading-snug"
                    style={{ color: verdictColor }}
                  >
                    {verdict.line}
                  </p>
                )}
                {/* Next change — the specific time-stamped heads-up
                    below the editorial mood. Italic serif so it
                    reads as a quiet annotation, not a second headline. */}
                {nextChange && (
                  <p
                    className="mt-0.5 font-serif text-[12.5px] italic leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {nextChange}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {cur.windSpeed && (
                    <span className="inline-flex items-center gap-1">
                      <Wind className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                      {cur.windSpeed}{cur.windDirection ? ` ${cur.windDirection}` : ""}
                    </span>
                  )}
                  {precip > 0 && (
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: precip >= 50 ? "var(--app-cool)" : undefined }}
                    >
                      <Droplets className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                      {precip}% rain
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sun arc — sunrise/sunset endpoints + current position. */}
            {sun && (
              <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Sunrise className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {clockLabel(sun.sunrise)}
                </span>
                <div className="relative h-6 flex-1">
                  {/* Arc — a top-half semicircle as the day's path. */}
                  <svg viewBox="0 0 100 24" className="absolute inset-0 h-full w-full" aria-hidden>
                    <path
                      d="M 2 22 Q 50 -10, 98 22"
                      fill="none"
                      stroke="color-mix(in srgb, var(--app-cool) 28%, transparent)"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                    {sunProgress > 0 && sunProgress < 1 && (
                      <>
                        <circle
                          cx={2 + 96 * sunProgress}
                          cy={22 - 32 * Math.sin(Math.PI * sunProgress)}
                          r={3.2}
                          fill="var(--app-accent)"
                        />
                        <circle
                          cx={2 + 96 * sunProgress}
                          cy={22 - 32 * Math.sin(Math.PI * sunProgress)}
                          r={6}
                          fill="color-mix(in srgb, var(--app-accent) 35%, transparent)"
                        />
                      </>
                    )}
                  </svg>
                </div>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Sunset className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {clockLabel(sun.sunset)}
                </span>
              </div>
            )}

            {/* Daylight remaining — the actionable read of the arc:
                how much light is left, not just when the sun sets. */}
            {daylightNote && (
              <div
                className="mt-1.5 text-[11px] font-medium tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
              >
                {daylightNote}
              </div>
            )}
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Weather is briefly unavailable.
          </p>
        )}
      </Link>

      {/* Hourly + weekly — interactive surfaces, NOT nested in the
          /pulse link. The hourly rail's tab buttons and the weekly
          show/hide toggle would otherwise double-fire navigation on
          every tap. */}
      {cur && next12.length > 0 && <WeatherHourlyChart hours={next12} />}
      {cur && forecast?.daily && forecast.daily.length > 0 && (
        <div
          className="-mx-4 -mb-4 mt-3"
          style={{ borderTop: "1px solid var(--app-border)" }}
        >
          <WeeklyForecast daily={forecast.daily} />
        </div>
      )}
    </article>
  );
}
