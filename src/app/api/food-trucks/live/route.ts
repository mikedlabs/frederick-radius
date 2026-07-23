import { NextResponse, type NextRequest } from "next/server";
import { FOOD_TRUCK_BY_SLUG } from "@/data/food-trucks";
import { getFreshestBeaconByTruck } from "@/lib/loaders/truckBeacons";
import { isRateLimited } from "@/lib/origin-check";
import type { FoodTruckMapPin } from "@/components/map/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = () => ({ "Cache-Control": "no-store" });

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

  return NextResponse.json(
    { ok: true, checkedAt: new Date().toISOString(), pins },
    { headers: noStore() },
  );
}
