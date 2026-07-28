/**
 * Browser-safe public contract for Frederick County rotorcraft observations.
 *
 * Callsigns, registrations, raw ICAO addresses, exact protected-aircraft
 * positions, headings, and flight histories are deliberately absent.
 */

/** FAA location 7MD3, Frederick Health Hospital Heliport. */
export const FMH_HELIPORT = {
  id: "7MD3",
  name: "Frederick Health Hospital Heliport",
  lat: 39.4225278,
  lng: -77.4149444,
  elevationFt: 386,
} as const;

export const ADSB_LOL_ATTRIBUTION =
  "Aircraft observations © ADSB.lol contributors, ODbL 1.0";
export const ADSB_LOL_URL = "https://adsb.lol";
export const ADSB_LOL_LICENSE_URL =
  "https://opendatacommons.org/licenses/odbl/1-0/";

export type RotorcraftEvidence = "adsb-category" | "icao-type";

/**
 * Only generic, non-Trooper observations away from the FMH geofence can appear
 * here. Coordinates are rounded to 0.01 degrees and no track is retained.
 */
export type RotorcraftSignal = {
  /** Server-keyed, daily-rotating identifier; never an aircraft ICAO address. */
  id: string;
  lat: number;
  lng: number;
  aircraftType: string | null;
  /** Rounded to the nearest 100 feet when available. */
  altitudeFt: number | null;
  /** Rounded to the nearest 5 knots when available. */
  groundSpeedKt: number | null;
  /** Rounded snapshot freshness, not a retained flight history. */
  reportAgeSeconds: number;
  rotorcraftEvidence: RotorcraftEvidence;
};

export type FmhActivitySummary = {
  possibleArrivalCount: number;
  possibleDepartureCount: number;
  helicopterNearbyCount: number;
};

export function emptyFmhActivity(): FmhActivitySummary {
  return {
    possibleArrivalCount: 0,
    possibleDepartureCount: 0,
    helicopterNearbyCount: 0,
  };
}

export function fmhActivityCount(activity: FmhActivitySummary): number {
  return (
    activity.possibleArrivalCount +
    activity.possibleDepartureCount +
    activity.helicopterNearbyCount
  );
}

export type RotorcraftApiResponse = {
  /**
   * Number of unique fresh public rotorcraft observations before protected
   * aircraft and FMH activity are reduced to aggregate status.
   */
  observationCount: number;
  signals: RotorcraftSignal[];
  /** Aggregate only. No Trooper position, callsign, or marker is returned. */
  trooperAirborneCount: number;
  /** Aggregate only. FMH activity is rendered at the fixed 7MD3 heliport. */
  fmhActivity: FmhActivitySummary;
  observedAt: string | null;
  receivedAt: string;
  available: boolean;
  /** Public ADS-B reception is useful but never complete. */
  coverage: "incomplete" | "unavailable";
  stale?: boolean;
  source: "ADSB.lol";
  attribution: string;
  sourceUrl: string;
  licenseUrl: string;
  note: string;
};
