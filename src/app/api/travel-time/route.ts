/**
 * Real walk + drive minutes from downtown Frederick to a point.
 *   /api/travel-time?lat=39.41&lng=-77.41
 * Cached 1h at the edge. Returns {} if Routes API isn't configured so the
 * caller can silently hide the chip.
 */
import { NextRequest } from "next/server";
import { travelTimes } from "@/lib/integrations/google-routes";
import { FREDERICK_CENTER } from "@/lib/geo";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  // Paid upstream (Google Routes) — block hotlinking.
  if (!isSameOriginRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // Travel time renders on every place sheet open; 60/min is comfortable.
  if (await isRateLimited(req, "travel-time", 60, 60)) {
    return new Response("Too Many Requests", { status: 429 });
  }
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") || "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "bad coords" }, { status: 400 });
  }
  // Sanity-bound to the Frederick County region
  if (lat < 39.0 || lat > 39.8 || lng < -78.0 || lng > -77.0) {
    return Response.json({}, { status: 200 });
  }
  const t = await travelTimes(
    { lat: FREDERICK_CENTER.lat, lng: FREDERICK_CENTER.lng },
    { lat, lng }
  );
  return Response.json(t, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
