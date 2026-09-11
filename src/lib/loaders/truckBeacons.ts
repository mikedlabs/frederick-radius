/**
 * truckBeacons — the live operator-beacon layer for /food-trucks.
 *
 * Reads the currently-live beacons (expires_at still in the future) from the
 * food_truck_beacons table and resolves them through the pure read layer so a
 * dead beacon can never leak onto the page. Server-only and fail-soft: with no
 * DATABASE_URL, or on any query error, this degrades to zero live beacons and
 * the static roster stands unchanged. Cached per request.
 *
 * The write side (who may drop a beacon) is the token gate in
 * /api/food-trucks/beacon; this file is read-only.
 */
import "server-only";
import { cache } from "react";
import { desc, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { food_truck_beacons } from "@/lib/db/schema";
import {
  liveBeaconsByTruck,
  readBeacon,
  type LiveBeacon,
  type TruckBeacon,
} from "@/lib/food-trucks/beacon";

/** Raw beacon rows still inside their window, freshest drop first. Fail-soft. */
const readLiveBeaconRows = cache(async (): Promise<TruckBeacon[]> => {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        truck_slug: food_truck_beacons.truck_slug,
        lat: food_truck_beacons.lat,
        lng: food_truck_beacons.lng,
        spot: food_truck_beacons.spot,
        note: food_truck_beacons.note,
        started_at: food_truck_beacons.started_at,
        expires_at: food_truck_beacons.expires_at,
      })
      .from(food_truck_beacons)
      .where(gt(food_truck_beacons.expires_at, new Date()))
      .orderBy(desc(food_truck_beacons.started_at))
      .limit(200);
    return rows.map((r) => ({
      truckSlug: r.truck_slug,
      lat: r.lat,
      lng: r.lng,
      spot: r.spot ?? undefined,
      note: r.note ?? undefined,
      startedAt: r.started_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
    }));
  } catch {
    return [];
  }
});

/**
 * The freshest LIVE beacon per truck, keyed by slug — resolved against the read
 * layer (via liveBeaconsByTruck), so this only ever contains genuinely live
 * beacons. This is the brief's canonical assembly.
 */
export async function getLiveTruckBeacons(): Promise<Map<string, LiveBeacon>> {
  return liveBeaconsByTruck(await readLiveBeaconRows(), new Date());
}

/**
 * The freshest live beacon per truck as RAW TruckBeacon rows — the serializable
 * shape the card's client component needs so it can re-check expiry on the
 * viewer's own clock (the page is a snapshot; the client keeps it honest and
 * drops a beacon the instant it lapses). Rows arrive freshest-first, so the
 * first live one per truck wins.
 */
export async function getFreshestBeaconByTruck(): Promise<Map<string, TruckBeacon>> {
  const rows = await readLiveBeaconRows();
  const now = new Date();
  const out = new Map<string, TruckBeacon>();
  for (const b of rows) {
    if (out.has(b.truckSlug)) continue;
    if (readBeacon(b, now)) out.set(b.truckSlug, b);
  }
  return out;
}
