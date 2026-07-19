import "server-only";

/**
 * The /beta cover flight — the drone library turned into the launch
 * page's product demo.
 *
 * The owner has 100+ geo-tagged aerial photos of the county (EXIF
 * latitude, longitude, altitude, capture date, curated into
 * public/images/seasons/aerial-manifest.json). Each cover slide pairs
 * one of those frames with two verifiable facts:
 *
 *   - the flight log: real coordinates, altitude, and month from the
 *     drone itself, set in the mono instrument voice
 *   - what Radius knows about the ground in frame: how many places sit
 *     within a half mile of that exact point, and how many are open at
 *     this minute (same decorate/isOpenNow engine as the county-wide
 *     open-now count)
 *
 * Honesty rules: no frame is ever NAMED ("over Baker Park") because the
 * camera shoots obliquely and a nearest-place guess could caption the
 * wrong subject. Coordinates, altitude, dates, and counts are all
 * machine-verifiable facts. Slides prefer the CURRENT season so the
 * page matches the world outside the window.
 */
import AERIAL_RAW from "../../public/images/seasons/aerial-manifest.json" with { type: "json" };
import { nearbyOpenCounts } from "@/lib/loaders/places";

export type AerialEntry = {
  src: string;
  lat: number;
  lng: number;
  altM: number | null;
  takenAt: string | null;
  season: string;
};

export type FlightSlide = {
  src: string;
  /** "39.4147° N · 77.4256° W" — the drone's own fix. */
  coordLabel: string;
  /** "210 m up · Oct 2024" (altitude omitted when the fix lacks one). */
  flightLabel: string;
  /** Places within a half mile of the fix. */
  total: number;
  /** Of those, open right now. */
  open: number;
};

const HALF_MILE_M = 805;
const MAX_SLIDES = 7;
/** Two fixes within ~150 m are the same vantage; keep the newest. */
const DEDUPE_DECIMALS = 3;

function seasonOf(now: Date): string {
  const month = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" }).format(now),
  );
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

/** Pure slide selection: current season first, newest first, one slide
 *  per vantage, topped up from the other seasons when thin. Exported
 *  for tests with an injected manifest. */
export function pickAerials(
  entries: AerialEntry[],
  now: Date,
  max: number = MAX_SLIDES,
): AerialEntry[] {
  const sane = entries.filter(
    (e) =>
      typeof e.lat === "number" &&
      typeof e.lng === "number" &&
      typeof e.src === "string" &&
      // A negative or near-zero altitude is a bad barometric fix, and the
      // frame is usually ground-level anyway — not a flight.
      (e.altM == null || e.altM >= 15),
  );
  const newestFirst = [...sane].sort(
    (a, b) => Date.parse(b.takenAt ?? "0") - Date.parse(a.takenAt ?? "0"),
  );
  const season = seasonOf(now);
  const ordered = [
    ...newestFirst.filter((e) => e.season === season),
    ...newestFirst.filter((e) => e.season !== season),
  ];
  const seen = new Set<string>();
  const out: AerialEntry[] = [];
  for (const e of ordered) {
    const key = `${e.lat.toFixed(DEDUPE_DECIMALS)},${e.lng.toFixed(DEDUPE_DECIMALS)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

export function coordLabel(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns} · ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

export function flightLabel(altM: number | null, takenAt: string | null): string {
  const parts: string[] = [];
  if (altM != null && Number.isFinite(altM) && altM > 0) parts.push(`${Math.round(altM)} m up`);
  const ms = Date.parse(takenAt ?? "");
  if (Number.isFinite(ms)) {
    parts.push(
      new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" }).format(ms),
    );
  }
  return parts.join(" · ");
}

/** The assembled slides for the cover flight. Fail-soft: an unreadable
 *  manifest yields [], and the page falls back to its static plate. */
export function buildFlightSlides(now: Date = new Date()): FlightSlide[] {
  let picked: AerialEntry[] = [];
  try {
    picked = pickAerials(AERIAL_RAW as AerialEntry[], now);
  } catch {
    return [];
  }
  if (picked.length === 0) return [];
  const counts = nearbyOpenCounts(picked, HALF_MILE_M, now);
  return picked.map((e, i) => ({
    src: e.src,
    coordLabel: coordLabel(e.lat, e.lng),
    flightLabel: flightLabel(e.altM, e.takenAt),
    total: counts[i]?.total ?? 0,
    open: counts[i]?.open ?? 0,
  }));
}
