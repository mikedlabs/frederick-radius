import Link from "next/link";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
  AlertTriangle,
  Droplets,
  Sunrise,
  Sunset,
} from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { FREDERICK_CENTER } from "@/lib/geo";
import WeeklyForecast from "./WeeklyForecast";

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

const ICONS = {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
} as const;

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

function hourLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  })
    .format(new Date(iso))
    .toLowerCase()
    .replace(" ", "");
}

function clockLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default async function WeatherHero() {
  const [forecast, alerts] = await Promise.all([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    getNwsAlerts().catch(() => []),
  ]);

  const cur = forecast?.hourly?.[0] ?? null;
  const next6 = forecast?.hourly?.slice(1, 7) ?? [];
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

  const CurIcon = cur ? ICONS[iconForShortForecast(cur.shortForecast)] : Cloud;

  return (
    <div className="space-y-2">
      {alerts.length > 0 && (
        <Link
          href="/pulse"
          className="tactile tactile-interactive flex items-center gap-2 rounded-[var(--app-radius-md)] px-3 py-2 text-[12px] font-semibold"
          style={{ background: "var(--app-danger)", color: "#fff" }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <span className="truncate">
            {alerts.length === 1
              ? alerts[0]?.event ?? "1 active weather alert"
              : `${alerts.length} active weather alerts`}
          </span>
          <span className="ml-auto shrink-0 opacity-90">View</span>
        </Link>
      )}

      <article
        className="tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4"
        aria-label="Current weather and today's outlook"
      >
        {cur ? (
          <>
            {/* Top row: big temp + icon + H/L + meta chips. */}
            <div className="flex items-start gap-3">
              <CurIcon
                className="h-12 w-12 shrink-0"
                strokeWidth={1.5}
                style={{ color: "var(--app-cool)" }}
                aria-hidden
              />
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
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {cur.shortForecast}
                </p>
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

            {/* Next 6 hours — wider strip than before; uses tabular nums. */}
            {next6.length > 0 && (
              <ul className="mt-3 flex items-end justify-between gap-1">
                {next6.map((h) => {
                  const Hi = ICONS[iconForShortForecast(h.shortForecast)];
                  const hp = h.probabilityOfPrecipitation ?? 0;
                  return (
                    <li
                      key={h.startTime}
                      className="flex w-10 flex-col items-center gap-0.5"
                    >
                      <span
                        className="text-[9px] font-semibold uppercase"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {hourLabel(h.startTime)}
                      </span>
                      <Hi
                        className="h-4 w-4"
                        strokeWidth={2}
                        style={{ color: "var(--app-ink-2)" }}
                        aria-hidden
                      />
                      <span
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {h.temperature}&deg;
                      </span>
                      {hp >= 30 && (
                        <span
                          className="text-[8px] tabular-nums"
                          style={{ color: "var(--app-cool)" }}
                        >
                          {hp}%
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {/* 7-day outlook — same card, hairline divider above it so
                it reads as a continuation of the current weather row
                rather than a detached forecast strip. The -mx-4 + -mb-4
                lets it span edge-to-edge inside the p-4 article. */}
            {forecast?.daily && forecast.daily.length > 0 && (
              <div
                className="-mx-4 -mb-4 mt-4"
                style={{ borderTop: "1px solid var(--app-border)" }}
              >
                <WeeklyForecast daily={forecast.daily} tone="dark" />
              </div>
            )}
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            Weather is briefly unavailable.
          </p>
        )}
      </article>
    </div>
  );
}
