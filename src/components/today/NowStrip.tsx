import Link from "next/link";
import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind,
  Sunset as SunsetIcon, Sunrise as SunriseIcon,
  Store, Clock, Music, AlertTriangle,
} from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { getNpsAlerts } from "@/lib/integrations/nps";
import { FREDERICK_CENTER } from "@/lib/geo";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { allUpcoming } from "@/lib/loaders/events";

/**
 * Now Strip — the city as personal concierge, in one paragraph.
 *
 * Sits at the top of /today and stitches the five real-time signals
 * the app actually has plumbed (current weather, sunset/sunrise,
 * places-open-now, places-closing-soon, events-starting-soon) into a
 * single calm briefing. This is the differentiator vs. Google: "any
 * search engine can tell you it's 78° in Frederick. Only Frederick
 * Radius can tell you that 8 of the 47 currently-open places will be
 * closed in an hour, the sun goes down at 8:24, and there are three
 * concerts about to start."
 *
 * Pure server component. Data is cached per the underlying integration
 * revalidate windows; the wrapping /today page sets revalidate = 60 so
 * the briefing stays fresh.
 */

const ICONS = { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Wind } as const;

const FREDERICK_LAT = 39.4143;
const FREDERICK_LNG = -77.4105;

// US Naval Observatory almanac math, copied verbatim from SunCountdown
// because we don't need a runtime cross-module dep here. Stable to ~1
// minute at temperate latitudes — fine for "Sunset in 2h 14m".
function sunTimes(date: Date, lat: number, lng: number) {
  const RAD = Math.PI / 180;
  const ZENITH = 90.833;
  const yyyy = date.getUTCFullYear();
  const mm = date.getUTCMonth();
  const dd = date.getUTCDate();
  const N = Math.floor((Date.UTC(yyyy, mm, dd) - Date.UTC(yyyy, 0, 0)) / 86_400_000);
  const lngHour = lng / 15;
  const calc = (rising: boolean): Date | null => {
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * RAD)) / RAD;
    RA = ((RA % 360) + 360) % 360;
    const Lq = Math.floor(L / 90) * 90;
    const RAq = Math.floor(RA / 90) * 90;
    RA = (RA + (Lq - RAq)) / 15;
    const sinDec = 0.39782 * Math.sin(L * RAD);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(ZENITH * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
    if (cosH > 1 || cosH < -1) return null;
    let H = rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD;
    H = H / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = ((T - lngHour) % 24 + 24) % 24;
    let dayOffset = 0;
    if (!rising && UT < 12) dayOffset = 1;
    if (rising && UT > 18) dayOffset = -1;
    const hours = Math.floor(UT);
    const minutes = Math.floor((UT - hours) * 60);
    const seconds = Math.floor((UT - hours - minutes / 60) * 3600);
    return new Date(Date.UTC(yyyy, mm, dd + dayOffset, hours, minutes, seconds));
  };
  const sunrise = calc(true);
  const sunset = calc(false);
  if (!sunrise || !sunset) return null;
  return { sunrise, sunset };
}

function formatGap(ms: number): { value: number; unit: "m" | "h"; words: string } {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return { value: min, unit: "m", words: `${min} minute${min === 1 ? "" : "s"}` };
  const h = Math.floor(min / 60);
  const m = min % 60;
  return { value: h, unit: "h", words: m === 0 ? `${h} hour${h === 1 ? "" : "s"}` : `${h}h ${m}m` };
}

function fredEasternHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(h, 10);
}

function fredEasternTimeString(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

/** NWS hands back Title Case ("Chance Showers And Thunderstorms").
 *  Reads as shouty in a calm briefing — sentence-case it. We keep
 *  the first letter capitalized + the rest lowercased; proper nouns
 *  are rare in current-conditions forecasts. */
function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function placeCountSnapshot(now: Date) {
  let open = 0;
  let closingSoon = 0;
  const oneHour = 60 * 60 * 1000;
  for (const p of publicPlaces()) {
    const card = decoratePlace(p, undefined, now);
    const s = card.open_status;
    if (s.state === "open") {
      open += 1;
      if (s.closesAt) {
        const [hh, mm] = s.closesAt.split(":").map((x) => parseInt(x, 10));
        const closeAt = new Date(now);
        closeAt.setHours(hh, mm, 0, 0);
        const dt = +closeAt - +now;
        if (dt > 0 && dt <= oneHour) closingSoon += 1;
      }
    } else if (s.state === "closing-soon") {
      open += 1;
      closingSoon += 1;
    }
  }
  return { open, closingSoon };
}

function eventsStartingSoon(now: Date): number {
  const horizon = new Date(now);
  horizon.setHours(horizon.getHours() + 3);
  return allUpcoming(now).filter((e) => {
    const t = +new Date(e.starts_at);
    return t >= +now && t <= +horizon;
  }).length;
}

export default async function NowStrip() {
  const now = new Date();

  const [forecast, nwsAlerts, npsAlerts] = await Promise.all([
    getNwsForecast(FREDERICK_CENTER),
    getNwsAlerts().catch(() => []),
    getNpsAlerts().catch(() => []),
  ]);

  const current = forecast?.hourly?.[0];
  const sun = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);
  const places = placeCountSnapshot(now);
  const eventsSoon = eventsStartingSoon(now);

  // Which sun event is next?
  let nextSun: { kind: "rise" | "set"; at: Date; gap: ReturnType<typeof formatGap> } | null = null;
  if (sun) {
    if (+now < +sun.sunrise) {
      nextSun = { kind: "rise", at: sun.sunrise, gap: formatGap(+sun.sunrise - +now) };
    } else if (+now < +sun.sunset) {
      nextSun = { kind: "set", at: sun.sunset, gap: formatGap(+sun.sunset - +now) };
    } else {
      // After sunset — show next sunrise.
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const tomorrowSun = sunTimes(tomorrow, FREDERICK_LAT, FREDERICK_LNG);
      if (tomorrowSun) {
        nextSun = { kind: "rise", at: tomorrowSun.sunrise, gap: formatGap(+tomorrowSun.sunrise - +now) };
      }
    }
  }

  const activeAlertCount = nwsAlerts.length + npsAlerts.filter((a) => /Frederick/i.test(a.parkName ?? "")).length;
  const hasEmergencyAlert = nwsAlerts.some((a) => a.severity === "Extreme" || a.severity === "Severe");

  const iconKey = current ? iconForShortForecast(current.shortForecast) : "Sun";
  const WeatherIcon = ICONS[iconKey as keyof typeof ICONS] ?? Sun;

  const SunIcon = nextSun?.kind === "rise" ? SunriseIcon : SunsetIcon;
  const eveningHour = fredEasternHour(now) >= 17;

  return (
    <section
      aria-label="Right now in Frederick County"
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* Optional emergency stripe — only fires for actual severe NWS
          alerts, not advisories. The full alert detail still lives in
          CivicAlerts below; this just makes sure the briefing card
          doesn't pretend everything's calm. */}
      {hasEmergencyAlert && (
        <Link
          href="/pulse"
          className="block bg-[var(--app-negative)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white"
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {nwsAlerts.length} active alert{nwsAlerts.length === 1 ? "" : "s"} · see details
          </span>
        </Link>
      )}

      {/* Eyebrow row: title + the time + active-alert pill (when not
          emergency). Editorial signage, not chrome. */}
      <header className="flex items-baseline justify-between gap-2 border-b px-4 pt-3 pb-2"
              style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-baseline gap-2.5">
          <span
            aria-hidden
            className="block h-[3px] w-7 rounded-full"
            style={{ background: "var(--app-brand)" }}
          />
          <h2
            className="font-serif text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Right now in Frederick
          </h2>
        </div>
        <span
          className="text-[11px] font-bold uppercase tracking-[0.1em] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {fredEasternTimeString(now)}
        </span>
      </header>

      {/* Briefing rows — three short editorial lines. */}
      <div className="space-y-2.5 px-4 py-3.5">
        {/* Row 1: weather + sun event */}
        <p
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] leading-snug"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
              color: "var(--app-brand)",
            }}
            aria-hidden
          >
            <WeatherIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          {current ? (
            <span>
              <span className="font-serif text-[20px] font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
                {Math.round(current.temperature)}°
              </span>
              <span className="ml-1.5 font-medium" style={{ color: "var(--app-ink-2)" }}>
                {sentenceCase(current.shortForecast)}.
              </span>
            </span>
          ) : (
            <span style={{ color: "var(--app-ink-3)" }}>Weather currently unavailable.</span>
          )}
          {nextSun && (
            <span className="inline-flex items-baseline gap-1" style={{ color: "var(--app-ink-3)" }}>
              <SunIcon className="h-3.5 w-3.5 self-center" strokeWidth={2} aria-hidden />
              <span>
                {nextSun.kind === "rise" ? "Sunrise" : "Sunset"} in{" "}
                <span className="font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                  {nextSun.gap.words}
                </span>
              </span>
            </span>
          )}
        </p>

        {/* Row 2: places — the unique-to-this-app signal. Stitches the
            verified-hours data into a live count. We say "confirmed
            open" (not just "open") because most places haven't posted
            hours; the explorer/Map still shows them with an honest
            "hours unconfirmed" pill. This row tells the user what we
            KNOW is open right now. */}
        <Link
          href="/map"
          className="group flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px] leading-snug transition"
          style={{ color: "var(--app-ink-2)" }}
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
              color: "var(--app-cool)",
            }}
            aria-hidden
          >
            <Store className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span>
            {places.open > 0 ? (
              <>
                <span className="font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
                  {places.open}
                </span>{" "}
                place{places.open === 1 ? "" : "s"} confirmed open
                {eveningHour ? " across the county" : " right now"}
                {places.closingSoon > 0 && (
                  <>
                    {" · "}
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: "var(--app-warning)" }}
                    >
                      <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      {places.closingSoon} closing in the hour
                    </span>
                  </>
                )}
              </>
            ) : (
              <>Posted hours are sparse right now — see Map for everything in range.</>
            )}
          </span>
        </Link>

        {/* Row 3: events */}
        <Link
          href="/events"
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px] leading-snug transition"
          style={{ color: "var(--app-ink-2)" }}
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-warm) 14%, transparent)",
              color: "var(--app-warm)",
            }}
            aria-hidden
          >
            <Music className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span>
            {eventsSoon > 0 ? (
              <>
                <span className="font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
                  {eventsSoon}
                </span>{" "}
                event{eventsSoon === 1 ? "" : "s"} starting in the next 3 hours
              </>
            ) : (
              <>Nothing starting in the next three hours.</>
            )}
          </span>
        </Link>

        {/* Quiet alert row — only when there ARE alerts but none rise
            to emergency. (The emergency case gets the red stripe at
            the top instead.) */}
        {!hasEmergencyAlert && activeAlertCount > 0 && (
          <Link
            href="/pulse"
            className="flex items-baseline gap-2 text-[13.5px] leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-warning) 16%, transparent)",
                color: "var(--app-warning)",
              }}
              aria-hidden
            >
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span>
              <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
                {activeAlertCount}
              </span>{" "}
              active advisor{activeAlertCount === 1 ? "y" : "ies"} for the county
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
