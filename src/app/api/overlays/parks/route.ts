import { getCountyParks } from "@/lib/integrations/fcGis";
import { countyParksOverlayGeoJson } from "@/lib/map/countyOverlayGeoJson";
import {
  geoJsonOverlayResponse,
  unavailableOverlayResponse,
} from "../_response";

export const runtime = "nodejs";
export const revalidate = 604_800;

export async function GET(request: Request) {
  const parks = await getCountyParks();
  // The official layer normally contains dozens of parks. The legacy getter
  // intentionally fails soft to [], so do not edge-cache that outage as a
  // trustworthy empty layer for a week.
  if (parks.length === 0) {
    return unavailableOverlayResponse(
      "County park locations are temporarily unavailable.",
    );
  }
  return geoJsonOverlayResponse(
    request,
    countyParksOverlayGeoJson(parks),
    revalidate,
  );
}
