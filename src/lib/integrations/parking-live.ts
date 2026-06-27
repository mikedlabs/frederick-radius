import "server-only";
import { unstable_cache } from "next/cache";

/**
 * Live downtown-garage occupancy — DORMANT until a feed is wired.
 *
 * Frederick's real-time garage availability is real, but it lives inside the
 * "Park Frederick" app, which is powered by the ParkZen platform (the Android
 * package is `com.parkzen.frederick`; ParkZen was acquired by Parking Guidance
 * Systems). There is NO free public web feed — the live layer is a commercial
 * vendor API. ParkZen's counts are crowd-sourced (it infers a freed spot from a
 * phone's motion / car-Bluetooth disconnect, ~96% claimed accuracy), so they
 * are good ESTIMATES, not gate-counts. Treat them as "about this full," never as
 * an authoritative space-by-space ledger.
 *
 * The flag: set `PARKING_OCCUPANCY_URL` (a licensed ParkZen / City endpoint
 * returning the deck list) and the whole feature lights up — the /parking live
 * badges, the settings toggle, and the live-full push cron all key off this
 * one env var. Unset (the default), every path is a graceful no-op: we never
 * fabricate a count, exactly as `data/sources.yaml` (cof_parking_occupancy,
 * pending_review) and parking-garages.ts already promise.
 *
 * The parser is deliberately shape-tolerant: the exact ParkZen response is not
 * confirmed, so it reads a few common field aliases, derives the missing one of
 * available/occupied from capacity when it can, and leaves anything it cannot
 * derive null. `parseOccupancy` is pure (no fetch, no env) so it is unit-tested
 * against representative shapes before the real feed is trusted.
 */

/** percent_full at/above which a garage is treated as "full" for alerts + UI. */
export const GARAGE_FULL_THRESHOLD = 90;
/** percent_full at/above which we show a "filling up" caution (but not full). */
export const GARAGE_FILLING_THRESHOLD = 75;

export type GarageOccupancy = {
  /** Our canonical ParkingGarage.slug, or null when the feed name can't be
   *  matched to one of the five city garages. */
  garageSlug: string | null;
  /** The name the feed reported (kept for debugging / unmatched decks). */
  name: string;
  available: number | null;
  occupied: number | null;
  capacity: number | null;
  percentFull: number | null;
  /** Raw status string from the feed (e.g. "OPEN", "FULL"), when present. */
  status: string | null;
  /** Derived: at/over the full threshold, zero spaces, or a FULL status. */
  isFull: boolean;
  /** Derived: at/over the filling threshold but not yet full. */
  isFilling: boolean;
  /** ISO timestamp the feed last updated this deck, when present. */
  updated: string | null;
};

export type ParkingOccupancySnapshot = {
  asOf: string | null;
  decks: GarageOccupancy[];
};

const EMPTY: ParkingOccupancySnapshot = { asOf: null, decks: [] };

/** True when the live feed is configured. Drives whether the UI/toggle/cron do
 *  anything at all — the single flag for the whole feature. */
export function parkingFeedConfigured(): boolean {
  return Boolean(process.env.PARKING_OCCUPANCY_URL);
}

// Feed deck name → our canonical garage slug. The feed names are unconfirmed,
// so match on the distinctive street word rather than an exact string; an
// unmatched deck stays usable (garageSlug null) but won't badge a card.
const NAME_TO_SLUG: Array<[RegExp, string]> = [
  [/court/i, "court-street-parking-garage-frederick"],
  [/carroll|creek/i, "carroll-creek-parking-garage-frederick"],
  [/patrick/i, "west-patrick-street-parking-deck"],
  [/church/i, "church-street-garage"],
  [/all\s*saints/i, "east-all-saints-street-parking-garage"],
];

function resolveGarageSlug(name: string): string | null {
  for (const [re, slug] of NAME_TO_SLUG) if (re.test(name)) return slug;
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type RawDeck = Record<string, unknown>;

/**
 * Pure normalizer — no fetch, no env. Accepts whatever the feed returns
 * (`{ decks: [...] }`, a bare array, or `{ data: [...] }`) and produces the
 * typed snapshot, deriving counts where possible and never inventing them.
 */
export function parseOccupancy(raw: unknown): ParkingOccupancySnapshot {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list: unknown =
    Array.isArray(raw) ? raw : root.decks ?? root.garages ?? root.lots ?? root.data ?? [];
  const decksRaw: RawDeck[] = Array.isArray(list) ? (list as RawDeck[]) : [];

  const decks: GarageOccupancy[] = decksRaw
    .map((d): GarageOccupancy => {
      const name = str(d.name ?? d.deck ?? d.garage ?? d.lot ?? d.title) ?? "";
      const capacity = num(d.capacity ?? d.total ?? d.spaces ?? d.spots);
      let available = num(d.available ?? d.open ?? d.free ?? d.vacant ?? d.spaces_available);
      let occupied = num(d.occupied ?? d.used ?? d.taken ?? d.filled);
      if (capacity !== null) {
        if (available === null && occupied !== null) available = Math.max(0, capacity - occupied);
        if (occupied === null && available !== null) occupied = Math.max(0, capacity - available);
      }
      let percentFull =
        num(d.percent_full ?? d.percentFull ?? d.occupancy ?? d.occupancy_pct);
      if (percentFull === null && capacity && occupied !== null) {
        percentFull = Math.round((occupied / capacity) * 100);
      }
      if (percentFull !== null) percentFull = Math.max(0, Math.min(100, percentFull));
      const status = str(d.status ?? d.state);
      const isFull =
        (percentFull !== null && percentFull >= GARAGE_FULL_THRESHOLD) ||
        (available !== null && available <= 0) ||
        /\bfull\b/i.test(status ?? "");
      const isFilling =
        !isFull && percentFull !== null && percentFull >= GARAGE_FILLING_THRESHOLD;
      return {
        garageSlug: resolveGarageSlug(name),
        name,
        available,
        occupied,
        capacity,
        percentFull,
        status,
        isFull,
        isFilling,
        updated: str(d.updated ?? d.last_updated ?? d.timestamp ?? d.as_of),
      };
    })
    .filter((d) => d.name);

  return { asOf: str(root.as_of ?? root.asOf ?? root.updated), decks };
}

async function fetchOccupancy(): Promise<ParkingOccupancySnapshot> {
  const url = process.env.PARKING_OCCUPANCY_URL;
  if (!url) return EMPTY;
  try {
    const headers: Record<string, string> = { "User-Agent": "frederick-radius" };
    // Optional bearer/key for the licensed vendor endpoint.
    if (process.env.PARKING_OCCUPANCY_KEY) {
      headers.Authorization = `Bearer ${process.env.PARKING_OCCUPANCY_KEY}`;
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return EMPTY;
    return parseOccupancy(await res.json());
  } catch {
    // Any hiccup degrades to "no live data" — the UI/cron simply show/send
    // nothing rather than a wrong or stale count.
    return EMPTY;
  }
}

/**
 * Cached snapshot — short TTL so the /parking page and the alert cron share one
 * upstream call and never hammer the vendor. Returns EMPTY when dormant.
 */
export const getParkingOccupancy = unstable_cache(fetchOccupancy, ["parking-occupancy-v1"], {
  revalidate: 60,
  tags: ["parking-occupancy"],
});

/** Live occupancy keyed by our garage slug — for the /parking cards. Only
 *  matched, real decks land in the map; dormant ⇒ empty map. */
export async function occupancyByGarageSlug(): Promise<Map<string, GarageOccupancy>> {
  const snap = await getParkingOccupancy();
  const m = new Map<string, GarageOccupancy>();
  for (const d of snap.decks) if (d.garageSlug) m.set(d.garageSlug, d);
  return m;
}
