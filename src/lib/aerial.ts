import { haversineMeters, type LngLat } from "@/lib/geo";
import AERIAL_MANIFEST from "@/../public/images/seasons/aerial-manifest.json";

/**
 * Geotagged aerial archive — 104 georeferenced drone shots, each tagged
 * with where (lat/lng), how high (altM), and the season it was taken.
 * The map already pins all of them; this module lets any surface that
 * knows a coordinate borrow the NEAREST shot as a "from above" beat.
 *
 * Honesty gate (the product's whole premise): the shots are clustered
 * tightly over downtown Frederick, so `nearestAerial` takes a hard
 * `maxMeters` and returns null when the closest shot is too far to
 * honestly say it shows *this* spot. A surface that gets null shows
 * nothing — never a Frederick drone photo captioned as another town.
 */

export type Season = "spring" | "summer" | "fall" | "winter";

export type Aerial = {
  src: string;
  lat: number;
  lng: number;
  altM: number | null;
  bearing: number | null;
  takenAt: string | null;
  season: Season;
};

const AERIALS = AERIAL_MANIFEST as Aerial[];

/** The highest-altitude shot in the archive — the "from way up" frame
 *  the descent starts from. */
export function highestAerial(): Aerial {
  return [...AERIALS].sort((a, b) => (b.altM ?? 0) - (a.altM ?? 0))[0];
}

/** Current season in Eastern time (matches SeasonalPhoto's ranges). */
export function currentSeason(now: Date = new Date()): Season {
  const md = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const month = Number(md.slice(0, 2));
  const day = Number(md.slice(3, 5));
  if ((month === 3 && day >= 20) || (month >= 4 && month <= 5) || (month === 6 && day <= 20)) return "spring";
  if ((month === 6 && day >= 21) || (month >= 7 && month <= 8) || (month === 9 && day <= 22)) return "summer";
  if ((month === 9 && day >= 23) || (month >= 10 && month <= 11) || (month === 12 && day <= 20)) return "fall";
  return "winter";
}

/**
 * The nearest aerial to a coordinate, or null when none is close enough
 * to honestly depict that spot. When `preferSeason` is set, a same-season
 * shot is favored within a modest detour (its effective distance is
 * scaled by 0.75), so a town gets a season-appropriate view without
 * reaching across the county for it.
 */
export function nearestAerial(
  at: LngLat,
  opts: { maxMeters?: number; preferSeason?: Season | null } = {},
): (Aerial & { distance_m: number }) | null {
  const { maxMeters = 800, preferSeason = null } = opts;
  let best: (Aerial & { distance_m: number }) | null = null;
  let bestScore = Infinity;
  for (const a of AERIALS) {
    const d = haversineMeters(at, { lng: a.lng, lat: a.lat });
    if (d > maxMeters) continue;
    const score = preferSeason && a.season === preferSeason ? d * 0.75 : d;
    if (score < bestScore) {
      bestScore = score;
      best = { ...a, distance_m: d };
    }
  }
  return best;
}
