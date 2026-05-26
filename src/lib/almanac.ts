/**
 * almanac.ts — sunrise / sunset / daylight math for Frederick.
 *
 * Pure: no network, no clock (Date inputs are explicit), no allocation
 * beyond the returned objects. The same `sunTimes` algorithm has lived
 * in `SunCountdown.tsx` since the early Today rebuild; it's hoisted
 * here so the new AlmanacFooter can share it and `daylightDelta` can
 * sit next to its underlying primitive instead of duplicating the
 * formula.
 *
 * Accuracy: classical US Naval Observatory algorithm, accurate to
 * within ~1 minute at temperate latitudes (Frederick sits at 39.41°N
 * — well inside that band). Plenty for a "today is 2 min longer than
 * yesterday" editorial line.
 */

/** Downtown Frederick latitude (~Carroll Creek). */
export const FREDERICK_LAT = 39.4143;
/** Downtown Frederick longitude. */
export const FREDERICK_LNG = -77.4105;

export type SunTimes = {
  sunrise: Date;
  sunset: Date;
};

/**
 * Classical "Almanac" sunrise/sunset algorithm (US Naval Observatory).
 * Returns sunrise + sunset Date objects for the date the input falls
 * on (in UTC). Stable, well-tested, and accurate to within a minute
 * at temperate latitudes — fine for a "Sunset in X" chip or a
 * daylight delta on the day footer.
 *
 * Returns null only at extreme latitudes where the sun never rises
 * or sets on the requested date (Frederick is nowhere near that).
 */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes | null {
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

/**
 * Total minutes of daylight on `date` at the given coordinates, or
 * null at extreme latitudes where the sun doesn't rise/set.
 */
export function daylightMinutes(
  date: Date,
  lat: number,
  lng: number,
): number | null {
  const t = sunTimes(date, lat, lng);
  if (!t) return null;
  return Math.round((t.sunset.getTime() - t.sunrise.getTime()) / 60_000);
}

export type DaylightDelta = {
  /** Today's sunrise/sunset Date objects. */
  today: SunTimes;
  /** Daylight length today, in whole minutes. */
  todayMinutes: number;
  /** Daylight length 24h ago, in whole minutes. */
  yesterdayMinutes: number;
  /**
   * todayMinutes - yesterdayMinutes. Positive = days lengthening
   * (winter solstice → summer solstice), negative = shortening.
   */
  deltaMinutes: number;
};

/**
 * Compare today's daylight length to 24 hours ago. The reading speaks
 * to season-of-year better than any single sunrise/sunset clock can:
 * "+2m today" tells you you're past the winter solstice, "-3m today"
 * tells you the slide into fall has started.
 *
 * Pure given `now`. Returns null only at extreme latitudes.
 */
export function daylightDelta(
  now: Date,
  lat: number = FREDERICK_LAT,
  lng: number = FREDERICK_LNG,
): DaylightDelta | null {
  const today = sunTimes(now, lat, lng);
  if (!today) return null;
  const todayMin = Math.round(
    (today.sunset.getTime() - today.sunrise.getTime()) / 60_000,
  );

  const yesterday = new Date(now.getTime() - 86_400_000);
  const yesterdayMin = daylightMinutes(yesterday, lat, lng);
  if (yesterdayMin === null) return null;

  return {
    today,
    todayMinutes: todayMin,
    yesterdayMinutes: yesterdayMin,
    deltaMinutes: todayMin - yesterdayMin,
  };
}
