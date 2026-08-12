import {
  getMarylandRoadClosuresFrederick,
  marylandRoadClosuresGeoJson,
} from "@/lib/integrations/md-road-closures";
import {
  geoJsonOverlayResponse,
  unavailableOverlayResponse,
} from "../_response";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(request: Request) {
  const snapshot = await getMarylandRoadClosuresFrederick({
    revalidateSeconds: revalidate,
  });
  if (
    snapshot.availability === "unavailable" ||
    snapshot.coverage === "none" ||
    (snapshot.coverage !== "complete" && snapshot.data.length === 0)
  ) {
    // A partial zero cannot establish that Frederick has no closures. Keep the
    // response retryable and non-cacheable instead of publishing false calm.
    return unavailableOverlayResponse(
      "Official Maryland road closures are temporarily unavailable.",
    );
  }

  return geoJsonOverlayResponse(
    request,
    marylandRoadClosuresGeoJson(snapshot),
    snapshot.availability === "stale" ? 15 : revalidate,
    {
      checkedAt: snapshot.checkedAt,
      ...(snapshot.sourceAsOf ? { sourceAsOf: snapshot.sourceAsOf } : {}),
      status: snapshot.availability,
      coverage:
        snapshot.coverage === "complete" ? "complete" : "partial",
    },
  );
}
