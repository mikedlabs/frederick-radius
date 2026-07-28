import "server-only";

import COUNTY_RING from "@/data/county-ring.json";
import {
  FMH_HELIPORT,
  emptyFmhActivity,
  type FmhActivitySummary,
  type RotorcraftEvidence,
  type RotorcraftSignal,
} from "./rotorcraft-public";

/**
 * Frederick County rotorcraft observations.
 *
 * This module deliberately works from one public ADS-B snapshot. It does not
 * identify owners from tail numbers, query privacy-bypass feeds, or turn a
 * missing observation into "grounded." ADS-B coverage is incomplete by nature.
 */

export type FmhActivity =
  | "possible_arrival"
  | "possible_departure"
  | "helicopter_nearby";

export type RawAdsbAircraft = {
  hex?: unknown;
  type?: unknown;
  flight?: unknown;
  r?: unknown;
  t?: unknown;
  alt_baro?: unknown;
  alt_geom?: unknown;
  gs?: unknown;
  track?: unknown;
  baro_rate?: unknown;
  geom_rate?: unknown;
  category?: unknown;
  lat?: unknown;
  lon?: unknown;
  seen?: unknown;
  seen_pos?: unknown;
  dbFlags?: unknown;
};

export type RawAdsbResponse = {
  ac?: unknown;
  now?: unknown;
};

export type OpaqueIdFactory = (
  privateSourceKey: string,
  observedAtMs: number,
) => string;

export type NormalizedRotorcraftSnapshot = {
  observationCount: number;
  signals: RotorcraftSignal[];
  trooperAirborneCount: number;
  fmhActivity: FmhActivitySummary;
  observedAtMs: number;
};

const COUNTY_OUTER_RING = COUNTY_RING as number[][];
const MAX_REPORT_AGE_SECONDS = 30;
const FMH_NEARBY_NM = 1.3;
const FMH_APPROACH_NM = 1.0;
const FMH_MAX_APPROACH_AGL_FT = 2_500;
const MIN_VERTICAL_TREND_FPM = 150;
const MIN_MOVING_SPEED_KT = 8;
const MAX_ALIGNMENT_DEGREES = 75;

/**
 * ICAO type-designator fallback for reports whose emitter category is absent.
 * A7 remains the authoritative first choice. This list is intentionally about
 * aircraft types, not registrations/operators, and covers common civil, public
 * safety, and medical rotorcraft likely to appear in the Mid-Atlantic.
 */
const ROTORCRAFT_TYPE_CODES = new Set([
  "A109",
  "A119",
  "A129",
  "A139",
  "A149",
  "A169",
  "A189",
  "AS32",
  "AS50",
  "AS55",
  "AS65",
  "B06",
  "B212",
  "B222",
  "B230",
  "B407",
  "B412",
  "B427",
  "B429",
  "BK17",
  "EC20",
  "EC25",
  "EC30",
  "EC35",
  "EC45",
  "EC55",
  "H47",
  "H53",
  "H60",
  "H64",
  "MD52",
  "MD60",
  "R22",
  "R44",
  "R66",
  "S76",
  "S92",
  "UH1",
]);

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toUpperCase();
  return clean || null;
}

/** Standard ray-casting point-in-polygon test over [longitude, latitude]. */
export function isInFrederickCounty(lng: number, lat: number): boolean {
  let inside = false;
  for (
    let i = 0, j = COUNTY_OUTER_RING.length - 1;
    i < COUNTY_OUTER_RING.length;
    j = i++
  ) {
    const [xi, yi] = COUNTY_OUTER_RING[i];
    const [xj, yj] = COUNTY_OUTER_RING[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function rotorcraftEvidence(
  raw: RawAdsbAircraft,
): RotorcraftEvidence | null {
  if (text(raw.category) === "A7") return "adsb-category";
  const type = text(raw.t);
  return type && ROTORCRAFT_TYPE_CODES.has(type) ? "icao-type" : null;
}

/**
 * FAA operator designator TRP maps to Maryland State Police / telephony
 * TROOPER. The expanded spellings are accepted only when transmitted as the
 * complete callsign. We do not use registrations or private tail lists.
 */
export function isMarylandStatePoliceCallsign(value: unknown): boolean {
  const callsign = text(value);
  return callsign
    ? /^(?:TRP|TROOPER|MDSP)(?:[\s-]?\d{1,4})?$/.test(callsign)
    : false;
}

export function distanceNm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const rNm = 3_440.065;
  const d2r = Math.PI / 180;
  const dLat = (to.lat - from.lat) * d2r;
  const dLng = (to.lng - from.lng) * d2r;
  const lat1 = from.lat * d2r;
  const lat2 = to.lat * d2r;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * rNm * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function initialBearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const d2r = Math.PI / 180;
  const lat1 = from.lat * d2r;
  const lat2 = to.lat * d2r;
  const dLng = (to.lng - from.lng) * d2r;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function headingDelta(a: number, b: number): number {
  const delta = Math.abs(((a - b + 540) % 360) - 180);
  return delta;
}

export function classifyFmhActivity(input: {
  lat: number;
  lng: number;
  altitudeAglFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  trackDeg: number | null;
}): { activity: FmhActivity | null; distanceNm: number } {
  const position = { lat: input.lat, lng: input.lng };
  const fromFmh = distanceNm(position, FMH_HELIPORT);
  if (fromFmh > FMH_NEARBY_NM) {
    return { activity: null, distanceNm: fromFmh };
  }

  const lowEnough =
    input.altitudeAglFt !== null &&
    input.altitudeAglFt >= 0 &&
    input.altitudeAglFt <= FMH_MAX_APPROACH_AGL_FT;
  const moving =
    input.groundSpeedKt !== null &&
    input.groundSpeedKt >= MIN_MOVING_SPEED_KT;
  const hasTrajectory =
    fromFmh <= FMH_APPROACH_NM &&
    lowEnough &&
    moving &&
    input.trackDeg !== null &&
    input.verticalRateFpm !== null;

  if (hasTrajectory) {
    const towardFmh = initialBearing(position, FMH_HELIPORT);
    if (
      input.verticalRateFpm! <= -MIN_VERTICAL_TREND_FPM &&
      headingDelta(input.trackDeg!, towardFmh) <= MAX_ALIGNMENT_DEGREES
    ) {
      return { activity: "possible_arrival", distanceNm: fromFmh };
    }

    const awayFromFmh = initialBearing(FMH_HELIPORT, position);
    if (
      input.verticalRateFpm! >= MIN_VERTICAL_TREND_FPM &&
      headingDelta(input.trackDeg!, awayFromFmh) <= MAX_ALIGNMENT_DEGREES
    ) {
      return { activity: "possible_departure", distanceNm: fromFmh };
    }
  }

  return { activity: "helicopter_nearby", distanceNm: fromFmh };
}

function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function addFmhActivity(
  summary: FmhActivitySummary,
  activity: FmhActivity,
): void {
  if (activity === "possible_arrival") {
    summary.possibleArrivalCount += 1;
  } else if (activity === "possible_departure") {
    summary.possibleDepartureCount += 1;
  } else {
    summary.helicopterNearbyCount += 1;
  }
}

/**
 * Reduce an ADSB.lol snapshot to current public rotorcraft observations inside
 * Frederick County.
 *
 * Trooper and FMH aircraft are reduced to counts. Only unrelated generic
 * rotorcraft reach `signals`, with coordinates rounded to 0.01 degrees. The
 * caller supplies a server-keyed ID factory so raw ICAO addresses cannot be
 * recovered from browser-visible identifiers.
 */
export function normalizeRotorcraftSnapshot(
  response: RawAdsbResponse,
  receivedAtMs: number,
  createOpaqueId: OpaqueIdFactory,
): NormalizedRotorcraftSnapshot {
  const sourceAt = finite(response.now);
  // readsb uses epoch milliseconds. Reject implausible clocks so freshness
  // never becomes misleading if an upstream field changes shape.
  const observedAtMs =
    sourceAt !== null && Math.abs(sourceAt - receivedAtMs) <= 5 * 60_000
      ? sourceAt
      : receivedAtMs;
  const rows = Array.isArray(response.ac)
    ? (response.ac as RawAdsbAircraft[])
    : [];

  const signals: RotorcraftSignal[] = [];
  const fmhActivity = emptyFmhActivity();
  const seenPrivateKeys = new Set<string>();
  let observationCount = 0;
  let trooperAirborneCount = 0;

  for (const raw of rows) {
    const lat = finite(raw.lat);
    const lng = finite(raw.lon);
    if (lat === null || lng === null || !isInFrederickCounty(lng, lat)) {
      continue;
    }

    const evidence = rotorcraftEvidence(raw);
    if (!evidence || raw.alt_baro === "ground") continue;
    // "Airborne" needs positive movement/altitude evidence, not merely the
    // absence of readsb's literal "ground" flag.
    const reportedGroundSpeed = finite(raw.gs);
    const explicitlyAirborne =
      finite(raw.alt_baro) !== null ||
      finite(raw.alt_geom) !== null ||
      (reportedGroundSpeed !== null &&
        reportedGroundSpeed >= MIN_MOVING_SPEED_KT);
    if (!explicitlyAirborne) continue;
    const privacyFlags = finite(raw.dbFlags);
    // readsb database flags: 1 military, 4 PIA, 8 LADD. This layer is about
    // ordinary public/local activity, not bypassing privacy or military
    // filtering, so those observations are deliberately omitted even when the
    // general point feed happens to return them.
    if (
      privacyFlags !== null &&
      ((privacyFlags & 1) !== 0 ||
        (privacyFlags & 4) !== 0 ||
        (privacyFlags & 8) !== 0)
    ) {
      continue;
    }

    const reportAgeSeconds = Math.max(
      0,
      finite(raw.seen_pos) ?? finite(raw.seen) ?? Number.POSITIVE_INFINITY,
    );
    if (reportAgeSeconds > MAX_REPORT_AGE_SECONDS) continue;

    const privateSourceKey =
      text(raw.hex) ??
      `${lat.toFixed(5)}:${lng.toFixed(5)}:${text(raw.t) ?? "rotorcraft"}`;
    if (seenPrivateKeys.has(privateSourceKey)) continue;
    seenPrivateKeys.add(privateSourceKey);
    observationCount += 1;

    const altitudeFt = finite(raw.alt_baro) ?? finite(raw.alt_geom);
    const altitudeAglFt =
      altitudeFt === null
        ? null
        : Math.max(0, Math.round(altitudeFt - FMH_HELIPORT.elevationFt));
    const groundSpeedKt = reportedGroundSpeed;
    const verticalRateFpm = finite(raw.baro_rate) ?? finite(raw.geom_rate);
    const trackDeg = finite(raw.track);
    const fmh = classifyFmhActivity({
      lat,
      lng,
      altitudeAglFt,
      groundSpeedKt,
      verticalRateFpm,
      trackDeg,
    });

    // Callsign inspection stays inside this server-only module. Neither the
    // callsign nor a position for an identified Trooper reaches the response.
    const isTrooper = isMarylandStatePoliceCallsign(raw.flight);
    if (isTrooper) trooperAirborneCount += 1;
    if (fmh.activity) addFmhActivity(fmhActivity, fmh.activity);
    if (isTrooper || fmh.activity) continue;

    signals.push({
      id: createOpaqueId(privateSourceKey, observedAtMs),
      lat: roundTo(lat, 0.01),
      lng: roundTo(lng, 0.01),
      aircraftType: text(raw.t),
      altitudeFt:
        altitudeFt === null ? null : roundTo(Math.max(0, altitudeFt), 100),
      groundSpeedKt:
        groundSpeedKt === null ? null : roundTo(groundSpeedKt, 5),
      reportAgeSeconds: roundTo(reportAgeSeconds, 5),
      rotorcraftEvidence: evidence,
    });
  }

  signals.sort(
    (a, b) =>
      a.reportAgeSeconds - b.reportAgeSeconds || a.id.localeCompare(b.id),
  );

  return {
    observationCount,
    signals: signals.slice(0, 40),
    trooperAirborneCount,
    fmhActivity,
    observedAtMs,
  };
}
