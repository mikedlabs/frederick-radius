/**
 * Real walk + drive minutes from a consented user origin to a point.
 *
 * POST keeps the origin out of URLs and access logs. User-specific route
 * results bypass Radius's persistent application cache, and the response is
 * never cacheable.
 */
import { NextRequest } from "next/server";
import { privateTravelTimes } from "@/lib/integrations/google-routes";
import { isInFrederickCountyArea } from "@/lib/geo";
import {
  hasJsonContentType,
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return json({ error: "forbidden-origin" }, 403);
  }
  // This is an explicit tap, not an automatic request on every sheet open.
  if (await isRateLimited(req, "travel-time", 30, 60)) {
    return Response.json(
      { error: "rate-limited" },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": "60" },
      },
    );
  }
  if (!hasJsonContentType(req)) {
    return json({ error: "unsupported-media-type" }, 415);
  }
  const parsed = await readJsonBodyWithLimit(req, 1_024);
  if (!parsed.ok) {
    return json(
      { error: parsed.error },
      parsed.error === "body-too-large" ? 413 : 400,
    );
  }
  const body = parsed.value && typeof parsed.value === "object"
    ? parsed.value as Record<string, unknown>
    : {};
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const fromLat = Number(body.fromLat);
  const fromLng = Number(body.fromLng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLng)
  ) {
    return json({ error: "bad-coordinates" }, 400);
  }
  if (
    !isInFrederickCountyArea(lng, lat) ||
    !isInFrederickCountyArea(fromLng, fromLat)
  ) {
    return json({});
  }
  return json(await privateTravelTimes(
    { lat: fromLat, lng: fromLng },
    { lat, lng },
  ));
}
