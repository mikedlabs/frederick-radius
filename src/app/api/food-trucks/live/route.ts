import { NextResponse, type NextRequest } from "next/server";
import { isRateLimited } from "@/lib/origin-check";
import type { FoodTruckMapPin } from "@/components/map/types";
import {
  getFoodTruckAvailability,
  type FoodTruckAvailability,
} from "@/lib/food-trucks/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = () => ({ "Cache-Control": "no-store" });

function mapPin(item: FoodTruckAvailability): FoodTruckMapPin | null {
  if (typeof item.lat !== "number" || typeof item.lng !== "number") return null;
  const slug = item.truckSlug ?? item.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  if (item.kind === "operator-live") {
    if (!item.endsAt) return null;
    return {
      id: item.id,
      slug,
      name: item.name,
      cuisine: item.cuisine,
      lat: item.lat,
      lng: item.lng,
      href: item.href,
      availability: "operator-live",
      spot: item.spot,
      note: item.note,
      startedAt: item.startsAt,
      expiresAt: item.endsAt,
      sourceName: "Operator live beacon",
      sourceUrl: item.sourceUrl,
    };
  }
  if (!item.venueName) return null;
  return {
    id: item.id,
    slug,
    name: item.name,
    cuisine: item.cuisine,
    lat: item.lat,
    lng: item.lng,
    href: item.href,
    availability: "published-stop",
    venueName: item.venueName,
    municipality: item.municipality,
    startedAt: item.startsAt,
    expiresAt: item.endsAt,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourceConfidence: item.sourceConfidence,
  };
}

/** Public read of operator-confirmed locations and current published stops. */
export async function GET(request: NextRequest) {
  if (await isRateLimited(request, "food-truck-live", 300, 60 * 60)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore(), "Retry-After": "60" } },
    );
  }

  const availability = await getFoodTruckAvailability();
  const pins: FoodTruckMapPin[] = availability.items.flatMap((item) => {
    const pin = mapPin(item);
    return pin ? [pin] : [];
  });

  return NextResponse.json(
    {
      ok: true,
      checkedAt: availability.checkedAt,
      scheduleState: availability.scheduleState,
      pins,
    },
    { headers: noStore() },
  );
}
