/**
 * Food-truck live layer, phase 2: the operator beacon.
 *
 * Venue hours are never treated as proof that a truck is serving. When an
 * operator is actually out, they drop a beacon (a live pin + a stated
 * "until"), and it shows on the card and map only while it is genuinely live.
 *
 * The cardinal rule: the map must never claim a truck is out when it isn't. So
 * a beacon carries its own expiry (the operator's stated close time, capped),
 * and everything here treats an expired or not-yet-started beacon as absent.
 * No "last seen 3 hours ago" ghosts.
 *
 * Pure read/derivation only — how a beacon gets written and who is allowed to
 * write it (the claim gate) lives elsewhere. This file is safe on server and
 * client and has no network.
 */

/** A raw beacon as stored: an operator's dropped location + window. */
export type TruckBeacon = {
  /** Keys to FoodTruck.slug. */
  truckSlug: string;
  lat: number;
  lng: number;
  /** Operator's free-text spot label ("Baker Park, west lot"). Optional. */
  spot?: string;
  /** Short "what's on" note ("Birria + horchata"). Optional. */
  note?: string;
  /** When they went out (ISO). */
  startedAt: string;
  /** When the beacon self-expires (ISO) — the operator's stated close time,
   *  already capped by the write path so a stale beacon can't linger. */
  expiresAt: string;
};

/** A beacon resolved against the current clock — only ever produced when live. */
export type LiveBeacon = {
  truckSlug: string;
  lat: number;
  lng: number;
  spot?: string;
  note?: string;
  /** Whole minutes until expiry (always > 0 for a live beacon). */
  minsLeft: number;
  /** "out" while there's real time left; "wrapping" in the last half hour, so
   *  the UI can soften the claim as they near close. */
  phase: "out" | "wrapping";
};

const WRAPPING_THRESHOLD_MIN = 30;

function isFiniteCoord(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= 180;
}

/**
 * Resolve one beacon against `now`. Returns null when the beacon hasn't
 * started, has expired, or is malformed — so a caller can never render a dead
 * beacon as live. Live beacons report the minutes left and whether they're in
 * the wind-down window.
 */
export function readBeacon(beacon: TruckBeacon, now: Date): LiveBeacon | null {
  if (!beacon.truckSlug) return null;
  if (!isFiniteCoord(beacon.lat) || !isFiniteCoord(beacon.lng)) return null;
  const start = Date.parse(beacon.startedAt);
  const end = Date.parse(beacon.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const t = now.getTime();
  if (t < start || t >= end) return null; // not yet out, or already wrapped
  const minsLeft = Math.max(1, Math.round((end - t) / 60_000));
  return {
    truckSlug: beacon.truckSlug,
    lat: beacon.lat,
    lng: beacon.lng,
    spot: beacon.spot?.trim() || undefined,
    note: beacon.note?.trim() || undefined,
    minsLeft,
    phase: minsLeft <= WRAPPING_THRESHOLD_MIN ? "wrapping" : "out",
  };
}

/**
 * Collapse a set of beacons to at most one LIVE beacon per truck — the freshest
 * (latest start) wins, since an operator who re-drops has moved. Expired and
 * not-started beacons drop out entirely. The result is keyed by truck slug so a
 * surface can join it to the static roster in O(1).
 */
export function liveBeaconsByTruck(
  beacons: readonly TruckBeacon[],
  now: Date,
): Map<string, LiveBeacon> {
  const freshest = new Map<string, { startedAt: number; live: LiveBeacon }>();
  for (const beacon of beacons) {
    const live = readBeacon(beacon, now);
    if (!live) continue;
    const startedAt = Date.parse(beacon.startedAt);
    const held = freshest.get(live.truckSlug);
    if (!held || startedAt > held.startedAt) {
      freshest.set(live.truckSlug, { startedAt, live });
    }
  }
  const out = new Map<string, LiveBeacon>();
  for (const [slug, held] of freshest) out.set(slug, held.live);
  return out;
}

/** A short, honest human label for a live beacon ("Out now, ~2 hr left",
 *  "Wrapping up, ~20 min left"). Prose is complete and calm; the count is a
 *  supporting detail, never the headline. */
export function beaconLabel(live: LiveBeacon): string {
  const left =
    live.minsLeft >= 90
      ? `about ${Math.round(live.minsLeft / 60)} hours left`
      : live.minsLeft >= 45
        ? "about an hour left"
        : `about ${live.minsLeft} minutes left`;
  return live.phase === "wrapping" ? `Wrapping up, ${left}.` : `Out now, ${left}.`;
}
