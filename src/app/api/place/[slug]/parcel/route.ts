/**
 * On-demand City of Frederick parcel context for a place.
 *
 *   GET /api/place/<slug>/parcel  ->  ParcelContext | null
 *
 * Gated and dormant by default. loadParcels returns null unless the
 * City source is approved, activated, and COF_PARCELS=1, so this route
 * returns null and the place sheet shows nothing. It never surfaces
 * City data while the licensing gate is open.
 */
import { NextResponse } from "next/server";
import { PLACE_BY_SLUG } from "@/data/places";
import { loadParcels, parcelContextFor } from "@/lib/loaders/cofParcels";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const fc = loadParcels();
    const place = PLACE_BY_SLUG[slug];
    if (!fc || !place?.geom) return NextResponse.json(null);

    const ctx = parcelContextFor(fc, place.geom.lng, place.geom.lat);
    return NextResponse.json(ctx, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(null);
  }
}
