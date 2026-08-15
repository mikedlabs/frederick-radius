import { NextResponse, type NextRequest } from "next/server";
import { FOOD_TRUCK_BY_SLUG } from "@/data/food-trucks";
import { getFreshestBeaconByTruck } from "@/lib/loaders/truckBeacons";
import { isRateLimited } from "@/lib/origin-check";
import type { FoodTruckMapPin } from "@/components/map/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_POLL_MS = 60_000;
const IDLE_POLL_MS = 5 * 60_000;
const CACHE_HEADERS = {
  // A live beacon lasts far longer than one request. Let browsers reuse the
  // answer briefly and let Vercel coalesce simultaneous visitors so an empty
  // layer does not buy one database read per phone per minute.
  "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
  "Vercel-CDN-Cache-Control":
    "public, s-maxage=30, stale-while-revalidate=60",
  "X-Content-Type-Options": "nosniff",
};

const noStore = () => ({ "Cache-Control": "private, no-store" });

/** Public read of locations that operators deliberately published as live. */
export async function GET(request: NextRequest) {
  if (await isRateLimited(request, "food-truck-live", 300, 60 * 60)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore(), "Retry-After": "60" } },
    );
  }

  const beacons = await getFreshestBeaconByTruck();
  const pins: FoodTruckMapPin[] = [...beacons.values()].flatMap((beacon) => {
    const truck = FOOD_TRUCK_BY_SLUG.get(beacon.truckSlug);
    if (!truck) return [];
    return [{
      slug: truck.slug,
      name: truck.name,
      cuisine: truck.cuisine,
      lat: beacon.lat,
      lng: beacon.lng,
      spot: beacon.spot,
      note: beacon.note,
      startedAt: beacon.startedAt,
      expiresAt: beacon.expiresAt,
    }];
  });

  return NextResponse.json({
    ok: true,
    status: pins.length > 0 ? "active" : "idle",
    checkedAt: new Date().toISOString(),
    nextPollAfterMs: pins.length > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS,
    pins,
  }, { headers: CACHE_HEADERS });
}
