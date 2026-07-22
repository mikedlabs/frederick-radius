import {
  Wind as WindIcon,
  Droplets,
  Sunrise as SunriseIcon,
  Sunset as SunsetIcon,
  Gauge,
  Eye,
  Moon,
  Thermometer,
} from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { getKfdkMetar, dewpointComfort } from "@/lib/integrations/aviationweather";
import { FREDERICK_CENTER } from "@/lib/geo";
import {
  sunTimes,
  daylightDelta,
  moonPhase,
  FREDERICK_LAT,
  FREDERICK_LNG,
} from "@/lib/almanac";

/**
 * WeatherMoreGrid — the 2-up grid of iOS Weather-style secondary
 * cards: Sun (sunrise + sunset + arc), Wind (current + gusts + dir),
 * Humidity (% + dew point), Feels Like (apparent / comfort), Pressure
 * (mb), Visibility (mi), Moon (phase + illumination + days to full).
 *
 * Lives inside WeatherMore (the disclosure wrapper) so the grid is
 * collapsed by default — the cards are dense but the cumulative
 * vertical commitment is high. Power users tap to reveal.
 *
 * Each card is rendered inline here (vs. its own component file)
 * because they share the same data fetches (NWS forecast + KFDK
 * METAR + almanac math) and the same visual primitive. Splitting
 * would mean 7 files of repetitive boilerplate.
 *
 * Data sources, by card:
 *   Sun        — almanac math (NOAA solar formula), no network
 *   Wind       — NWS hourly forecast (active feed) + KFDK gusts when available
 *   Humidity   — KFDK METAR (computed via Magnus from temp + dewpoint)
 *   Feels Like — KFDK dewpoint comfort label
 *   Pressure   — KFDK METAR (mslp or altimeter setting, hPa)
 *   Visibility — KFDK METAR (statute miles)
 *   Moon       — almanac math (synodic-month approximation), no network
 *
 * Cards that depend on KFDK silently hide their tile when the METAR
 * fetch fails. The card grid keeps its shape (other cards stay) so
 * the layout never collapses on a partial outage.
 */

function clockLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(d)
    .replace(/\s?AM$/i, "a")
    .replace(/\s?PM$/i, "p");
}

function compassPoint(deg: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(deg / 22.5) % 16];
}

export default async function WeatherMoreGrid() {
  const [forecast, metar] = await Promise.all([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    getKfdkMetar().catch(() => null),
  ]);

  const now = new Date();
  const sun = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);
  const delta = daylightDelta(now);
  const moon = moonPhase(now);

  // Sun position 0–1 along today's daytime arc, for the small arc viz
  // on the Sun tile. Negative or > 1 → not currently in the daytime
  // window (we show "passed" / "upcoming" instead of the dot).
  let sunProgress: number | null = null;
  if (sun) {
    const t = now.getTime();
    const a = sun.sunrise.getTime();
    const b = sun.sunset.getTime();
    if (t >= a && t <= b) {
      sunProgress = (t - a) / (b - a);
    }
  }

  const cur = forecast?.hourly?.[0] ?? null;
  const windSpeedText = cur?.windSpeed ?? null;
  const windDirText = cur?.windDirection ?? null;
  const gustsKts = metar?.windGustKts ?? null;
  const dirDeg = metar?.windDirectionDeg ?? null;

  const comfort = metar ? dewpointComfort(metar.dewpointF) : null;

  return (
    <div className="columns-2 gap-2 [&>*]:mb-2">
      {/* ── SUN ───────────────────────────────────────────────────── */}
      {sun && (
        <MoreTile
          eyebrow="Sun"
          eyebrowIcon={<SunriseIcon className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
        >
          <p className="font-data text-[22px] font-semibold leading-none">
            {clockLabel(sun.sunset)}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            Sunset
          </p>
          {/* Tiny sun-arc visual: dotted top-half semicircle, a brand
              dot at the current sun position when we're in the
              daytime window. Reads as the iOS sunset tile in 80px. */}
          <svg viewBox="0 0 100 22" className="mt-2 block h-6 w-full" aria-hidden>
            <path
              d="M 2 20 Q 50 -8, 98 20"
              fill="none"
              stroke="color-mix(in srgb, var(--app-cool) 28%, transparent)"
              strokeWidth={1.25}
              strokeDasharray="2 3"
            />
            {sunProgress !== null && (
              <>
                <circle
                  cx={2 + 96 * sunProgress}
                  cy={20 - 28 * Math.sin(Math.PI * sunProgress)}
                  r={2.8}
                  fill="var(--app-accent)"
                />
                <circle
                  cx={2 + 96 * sunProgress}
                  cy={20 - 28 * Math.sin(Math.PI * sunProgress)}
                  r={5}
                  fill="color-mix(in srgb, var(--app-accent) 35%, transparent)"
                />
              </>
            )}
          </svg>
          <p className="mt-1 font-data text-[11px] opacity-70">
            Sunrise {clockLabel(sun.sunrise)}
          </p>
        </MoreTile>
      )}

      {/* ── WIND ──────────────────────────────────────────────────── */}
      {(windSpeedText || gustsKts !== null) && (
        <MoreTile
          eyebrow="Wind"
          eyebrowIcon={<WindIcon className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
        >
          <p className="font-data text-[22px] font-semibold leading-none">
            {windSpeedText || (metar?.windSpeedKts != null ? `${metar.windSpeedKts} kt` : "N/A")}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            {dirDeg !== null
              ? `From ${compassPoint(dirDeg)}`
              : windDirText
                ? `From ${windDirText}`
                : "Current"}
          </p>
          {gustsKts !== null && (
            <p className="mt-2 font-data text-[12px]">
              <span className="opacity-70">Gusts to </span>
              <span className="font-semibold">{gustsKts} kt</span>
            </p>
          )}
        </MoreTile>
      )}

      {/* ── HUMIDITY ──────────────────────────────────────────────── */}
      {metar && (
        <MoreTile
          eyebrow="Humidity"
          eyebrowIcon={<Droplets className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
        >
          <p className="font-data text-[22px] font-semibold leading-none">
            {metar.relativeHumidity}%
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            Right now
          </p>
          <p className="mt-2 text-[12px] leading-snug opacity-80">
            The dew point is{" "}
            <span className="font-data font-semibold">{metar.dewpointF}°</span>
            {comfort && comfort.label !== "Comfortable" && comfort.label !== "Dry" && (
              <>
                <span className="opacity-50"> · </span>
                <span style={{ color: comfort.color }}>
                  {comfort.label.toLowerCase()}
                </span>
              </>
            )}
            .
          </p>
        </MoreTile>
      )}

      {/* ── FEELS LIKE ────────────────────────────────────────────── */}
      {metar && cur && (
        <MoreTile
          eyebrow="Feels like"
          eyebrowIcon={<Thermometer className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
        >
          <p className="font-data text-[22px] font-semibold leading-none">
            {metar.tempF}&deg;
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            At KFDK
          </p>
          {comfort && (
            <p className="mt-2 text-[12px] leading-snug opacity-80">
              {comfort.label === "Comfortable" || comfort.label === "Dry" ? (
                "The humidity feels comfortable."
              ) : (
                <>
                  <span style={{ color: comfort.color }}>{comfort.label}</span>,{" "}
                  humidity makes it feel{" "}
                  {comfort.label === "Very dry" ? "drier" : "warmer"}.
                </>
              )}
            </p>
          )}
        </MoreTile>
      )}

      {/* ── PRESSURE ──────────────────────────────────────────────── */}
      {metar?.pressureHpa !== null && metar?.pressureHpa !== undefined && (
        <MoreTile
          eyebrow="Pressure"
          eyebrowIcon={<Gauge className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
        >
          <p className="font-data text-[22px] font-semibold leading-none">
            {metar.pressureHpa.toFixed(0)}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            hPa
          </p>
          <p className="mt-2 text-[12px] leading-snug opacity-80">
            {metar.pressureHpa < 1009
              ? "Pressure is below average."
              : metar.pressureHpa > 1019
                ? "Pressure is above average."
                : "Pressure is steady."}
          </p>
        </MoreTile>
      )}

      {/* ── VISIBILITY ────────────────────────────────────────────── */}
      {metar?.visibilityMi !== null && metar?.visibilityMi !== undefined && (
        <MoreTile
          eyebrow="Visibility"
          eyebrowIcon={<Eye className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
        >
          <p className="font-data text-[22px] font-semibold leading-none">
            {metar.visibilityMi}
            <span className="ml-1 text-[14px] font-normal opacity-70">mi</span>
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            At KFDK
          </p>
          <p className="mt-2 text-[12px] leading-snug opacity-80">
            {metar.visibilityMi >= 10
              ? "KFDK reports visibility of 10 miles or more."
              : metar.visibilityMi >= 5
                ? "KFDK reports visibility between 5 and 10 miles."
                : "KFDK reports visibility below 5 miles."}
          </p>
        </MoreTile>
      )}

      {/* ── MOON ──────────────────────────────────────────────────── */}
      <MoreTile
        eyebrow={moon.name}
        eyebrowIcon={<Moon className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
      >
        <p className="font-data text-[22px] font-semibold leading-none">
          {Math.round(moon.illumination * 100)}%
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
          Illuminated
        </p>
        <p className="mt-2 font-data text-[12px] opacity-80">
          {moon.name === "Full Moon"
            ? "The moon is full tonight."
            : moon.daysToFull < moon.daysToNew
              ? `Next full in ${moon.daysToFull} days`
              : `Next new in ${moon.daysToNew} days`}
        </p>
      </MoreTile>

      {/* ── DAYLIGHT DELTA ────────────────────────────────────────── */}
      {delta && (
        <MoreTile
          eyebrow="Daylight"
          eyebrowIcon={<SunsetIcon className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
        >
          <p className="font-data text-[22px] font-semibold leading-none">
            {Math.floor(delta.todayMinutes / 60)}
            <span className="ml-0.5 text-[14px] font-normal opacity-70">h </span>
            {delta.todayMinutes % 60}
            <span className="ml-0.5 text-[14px] font-normal opacity-70">m</span>
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide opacity-70">
            Today
          </p>
          <p className="mt-2 font-data text-[12px] opacity-80">
            {delta.deltaMinutes === 0
              ? "Same as yesterday"
              : delta.deltaMinutes > 0
                ? `+${delta.deltaMinutes} min vs yesterday`
                : `${delta.deltaMinutes} min vs yesterday`}
          </p>
        </MoreTile>
      )}
    </div>
  );
}

/**
 * The visual primitive every iOS-style tile in the grid uses: a
 * paper-cream rounded rect with a small eyebrow (icon + uppercase
 * label), a big serif value, and freeform body content (subtitle,
 * tiny visualization, or one-line note).
 */
function MoreTile({
  eyebrow,
  eyebrowIcon,
  children,
}: {
  eyebrow: string;
  eyebrowIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article
      className="flex break-inside-avoid flex-col rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <header
        className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        {eyebrowIcon}
        {eyebrow}
      </header>
      <div className="flex flex-1 flex-col" style={{ color: "var(--app-ink)" }}>
        {children}
      </div>
    </article>
  );
}
