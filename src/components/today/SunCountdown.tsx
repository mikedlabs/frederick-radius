import { Sunrise, Sunset, Sun } from "lucide-react";

/**
 * SunCountdown — a tiny editorial chip with the next sun event:
 * sunrise, sunset, or golden hour. Pure math: NOAA's solar formulas
 * for Frederick's latitude/longitude, no network, no allocation.
 * Renders one line so it can tuck into the hero strip without
 * stealing real estate.
 *
 * Golden hour is defined as the hour straddling sunset (-/+30min)
 * here — photographer's heuristic that survives the latitude band
 * Frederick sits in. We surface it explicitly when the user is
 * inside that window because it's the moment the SkyHero gradient
 * is most alive and the app can say "go look outside."
 */

const FREDERICK_LAT = 39.4143;
const FREDERICK_LNG = -77.4105;

/**
 * Classical "Almanac" sunrise/sunset algorithm (US Naval Observatory).
 * Returns sunrise + sunset Date objects for the date the input falls
 * on (in UTC). Stable, well-tested, and accurate to within a minute
 * at temperate latitudes — fine for a "Sunset in X" chip.
 */
function sunTimes(date: Date, lat: number, lng: number) {
  const RAD = Math.PI / 180;
  const ZENITH = 90.833; // official zenith for sunrise/sunset

  const yyyy = date.getUTCFullYear();
  const mm = date.getUTCMonth();
  const dd = date.getUTCDate();
  // Day of year (1-366).
  const N =
    Math.floor(
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
    // Quadrant adjustment so RA matches L.
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
    // The almanac formula yields UT mod 24 — we have to choose which
    // UT day it belongs to. At Frederick's longitude (~-77°) sunset's
    // UT is ~00:30 the *next* calendar day, so a sunset UT < 12 has
    // wrapped past midnight and belongs to dd + 1. Symmetrically a
    // sunrise UT > 12 would belong to dd - 1 (only relevant near the
    // dateline; harmless to apply here).
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

function formatGap(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `${Math.round(h / 24)}d`;
}

function formatClock(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default function SunCountdown({
  tone = "light",
  now = new Date(),
}: {
  tone?: "light" | "dark";
  now?: Date;
}) {
  const today = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);
  if (!today) return null;

  const ink = tone === "dark" ? "rgba(255,255,255,0.92)" : "var(--app-ink-2)";
  const subInk = tone === "dark" ? "rgba(255,255,255,0.65)" : "var(--app-ink-3)";

  // What's coming next?
  let icon: typeof Sun;
  let label: string;
  let when: Date;

  if (now < today.sunrise) {
    icon = Sunrise;
    label = "Sunrise";
    when = today.sunrise;
  } else if (now < today.sunset) {
    // Golden-hour window: ±30 min around sunset.
    const goldenStart = new Date(today.sunset.getTime() - 30 * 60_000);
    if (now >= goldenStart) {
      icon = Sun;
      label = "Golden hour: sunset";
      when = today.sunset;
    } else {
      icon = Sunset;
      label = "Sunset";
      when = today.sunset;
    }
  } else {
    // After sunset: surface tomorrow's sunrise.
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const t = sunTimes(tomorrow, FREDERICK_LAT, FREDERICK_LNG);
    if (!t) return null;
    icon = Sunrise;
    label = "Sunrise";
    when = t.sunrise;
  }

  const Icon = icon;
  const gap = formatGap(when.getTime() - now.getTime());
  const clock = formatClock(when);

  return (
    <p
      className="inline-flex items-center gap-1.5 text-[12px] font-medium"
      style={{ color: ink }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span>{label} in {gap}</span>
      <span style={{ color: subInk }}>· {clock}</span>
    </p>
  );
}
