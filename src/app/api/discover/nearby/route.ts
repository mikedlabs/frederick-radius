/**
 * GET /api/discover/nearby — Frederick-scoped Google Places searchNearby.
 *
 *   ?muni=brunswick                      pin center to one of the
 *                                         13 county municipality slugs
 *   ?lat=39.4143&lng=-77.4105             alternate center
 *   ?radius=3000                          meters, clamped 50 ≤ r ≤ 30000
 *   ?types=tourist_attraction,park,...    CSV of Google primaryTypes
 *   ?max=20                               1–20, Google's hard cap
 *   ?rank=DISTANCE|POPULARITY             default DISTANCE
 *
 * Returns the structured NearbyResult / NearbyError JSON directly.
 *   200 — success
 *   400 — invalid input
 *   502 — Places API failure that survived retry
 *   503 — API key not configured
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { searchNearby, FREDERICK_CENTER } from "@/lib/integrations/google-nearby";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

export const runtime = "nodejs";

const MUNI_SLUGS = Object.keys(MUNICIPALITY_BY_SLUG) as [string, ...string[]];

const QuerySchema = z.object({
  muni: z.enum(MUNI_SLUGS).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().int().min(50).max(30_000).optional(),
  types: z.string().optional(),
  max: z.coerce.number().int().min(1).max(20).optional(),
  rank: z.enum(["DISTANCE", "POPULARITY"]).optional(),
});

export async function GET(req: Request) {
  // Paid upstream — block hotlinking. Vercel Firewall handles the
  // per-IP rate limit on top of this.
  if (!isSameOriginRequest(req)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  // searchNearby is a much heavier Google API call than autocomplete;
  // 30/min is plenty for normal browsing and stops scrapers cold.
  if (await isRateLimited(req, "discover-nearby", 30, 60)) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { ok: false, status: 503, message: "Google Places is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, status: 400, message: "The query is invalid.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { muni, lat, lng, radius, types, max, rank } = parsed.data;
  const center =
    typeof lat === "number" && typeof lng === "number"
      ? { lat, lng }
      : FREDERICK_CENTER;

  const result = await searchNearby({
    municipality: muni,
    center,
    radiusMeters: radius,
    includedPrimaryTypes: types
      ? types
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [],
    maxResultCount: max,
    rankPreference: rank,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result, {
    status: 200,
    headers: {
      // 5-minute edge cache per unique URL — searchNearby is read-only
      // and stable; hitting Google more than every 5 min is waste.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
