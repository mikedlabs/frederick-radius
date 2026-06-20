/**
 * Sun times — sunrise, sunset, and the golden-hour windows for a
 * lat/lng on a given date. Pure, deterministic, no API: the standard
 * NOAA / sunrise-equation solar position math. Nothing here is
 * fabricated — every minute is computed from the date and the
 * observer's coordinates.
 *
 * We expose the two things a place-discovery app actually cares about:
 * when the light is good (golden hour = sun between the horizon and
 * ~6° elevation) and when it's dark. Times are returned as Date objects
 * (UTC instants); the UI formats them in America/New_York.
 */

const DEG = Math.PI / 180;

const ET_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Day-of-year (1-based) + UTC-midnight of the EASTERN calendar day of `date`.
 *
 * Must key off the LOCAL (ET) date, not the UTC date: an evening instant during
 * golden hour (e.g. 8:30 PM ET in June) is already the NEXT UTC day, and keying
 * off UTC would solve the sun for the wrong day — suppressing the golden-hour
 * window exactly when it's happening. The app is entirely ET, so the Eastern
 * date is always the right day to solve for.
 */
function easternCalendarDay(date: Date): { doy: number; midnightMs: number } {
  const parts = ET_DATE_PARTS.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const start = Date.UTC(y, 0, 1);
  const midnightMs = Date.UTC(y, m - 1, d);
  const doy = Math.floor((midnightMs - start) / 86_400_000) + 1;
  return { doy, midnightMs };
}

/**
 * Solve for the UTC instant of a given sun elevation (degrees) on the
 * calendar day of `date`, either the morning (rising) or evening
 * (setting) crossing. NOAA equation-of-time / declination method —
 * the same math the NOAA solar calculator uses. Returns null when the
 * sun never reaches that elevation that day (polar day/night — never
 * at Frederick's latitude, but handled honestly, not guessed).
 */
function timeAtElevation(
  date: Date,
  lat: number,
  lng: number,
  elevationDeg: number,
  evening: boolean,
): Date | null {
  const { doy, midnightMs } = easternCalendarDay(date);
  // Fractional year (radians), evaluated near solar noon.
  const g = ((2 * Math.PI) / 365) * (doy - 1 + 0.5);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g)); // minutes
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g); // radians

  const latR = lat * DEG;
  const zenith = (90 - elevationDeg) * DEG;
  const cosH =
    (Math.cos(zenith) - Math.sin(latR) * Math.sin(decl)) /
    (Math.cos(latR) * Math.cos(decl));
  if (cosH > 1 || cosH < -1) return null; // never reaches this elevation today

  const ha = (Math.acos(cosH) / DEG) * (evening ? 1 : -1); // degrees
  // Local solar noon (UTC min) = 720 - 4*lng - eqTime, with lng signed
  // east-positive / west-negative. Sunrise is 4*HA minutes before noon,
  // sunset 4*HA after (ha already carries the sign).
  const minutesUTC = 720 - 4 * lng - eqTime + 4 * ha;
  return new Date(midnightMs + minutesUTC * 60_000);
}

export type SunTimes = {
  sunrise: Date | null;
  sunset: Date | null;
  /** Morning golden hour: sunrise → sun at +6°. */
  goldenMorningEnd: Date | null;
  /** Evening golden hour: sun at +6° → sunset. */
  goldenEveningStart: Date | null;
  /** Civil dusk (sun at -6°), the honest "it's dark now" marker. */
  dusk: Date | null;
};

const SUNRISE_ELEV = -0.833; // standard refraction + solar radius
const GOLDEN_ELEV = 6;
const CIVIL_ELEV = -6;

export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  return {
    sunrise: timeAtElevation(date, lat, lng, SUNRISE_ELEV, false),
    sunset: timeAtElevation(date, lat, lng, SUNRISE_ELEV, true),
    goldenMorningEnd: timeAtElevation(date, lat, lng, GOLDEN_ELEV, false),
    goldenEveningStart: timeAtElevation(date, lat, lng, GOLDEN_ELEV, true),
    dusk: timeAtElevation(date, lat, lng, CIVIL_ELEV, true),
  };
}

/**
 * The single most useful line right now: if the evening golden hour is
 * still ahead today, name its window; else if sunrise/sunset is the
 * next notable thing, name that. Returns null when nothing is
 * meaningfully upcoming (deep night) so the UI can simply omit it
 * rather than show filler.
 */
export type SunHint = { label: string; from: Date; to?: Date };

export function nextSunHint(now: Date, lat: number, lng: number): SunHint | null {
  const t = sunTimes(now, lat, lng);
  if (!t.sunrise || !t.sunset || !t.goldenEveningStart) return null;
  if (now >= t.sunset) return null; // sun is down — no good light to promise
  if (now >= t.goldenEveningStart) {
    return { label: "Golden hour now", from: t.goldenEveningStart, to: t.sunset };
  }
  // Only surface the upcoming window in the afternoon — past local solar
  // noon (the honest midpoint of sunrise and sunset). Mornings, midday,
  // and the dead of night get nothing rather than filler.
  const solarNoon = (t.sunrise.getTime() + t.sunset.getTime()) / 2;
  if (now.getTime() >= solarNoon) {
    return { label: "Golden hour", from: t.goldenEveningStart, to: t.sunset };
  }
  return null;
}
