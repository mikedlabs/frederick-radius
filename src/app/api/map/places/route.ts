import { createHash } from "node:crypto";
import { mapPinPlaces } from "@/lib/map/placePins";

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  const generatedAt = new Date();
  const payload = JSON.stringify({
    generatedAt: generatedAt.toISOString(),
    places: mapPinPlaces(generatedAt),
  });
  const etag = `"${createHash("sha256").update(payload).digest("base64url")}"`;

  return new Response(payload, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
      etag,
    },
  });
}
