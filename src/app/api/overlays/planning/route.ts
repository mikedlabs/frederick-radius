import type { MapLineFC } from "@/components/map/types";
import { getCityFrederickChangeRecords } from "@/lib/integrations/cityFrederickChanges";
import { getCountyPlanningApplications } from "@/lib/integrations/fcPlanningProjects";
import { countyPlanningOverlayGeoJson } from "@/lib/map/countyOverlayGeoJson";
import { cityChangeOverlayGeoJson } from "@/lib/map/cityChangeGeoJson";
import {
  geoJsonOverlayResponse,
  unavailableOverlayResponse,
} from "../_response";

export const runtime = "nodejs";
export const revalidate = 21_600;

function oldestIso(values: Array<string | undefined>): string | undefined {
  return values.reduce<string | undefined>((oldest, value) => {
    if (!value) return oldest;
    return !oldest || Date.parse(value) < Date.parse(oldest) ? value : oldest;
  }, undefined);
}

function newestIso(values: Array<string | undefined>): string | undefined {
  return values.reduce<string | undefined>((newest, value) => {
    if (!value) return newest;
    return !newest || Date.parse(value) > Date.parse(newest) ? value : newest;
  }, undefined);
}

export async function GET(request: Request) {
  const [county, city] = await Promise.all([
    getCountyPlanningApplications(),
    getCityFrederickChangeRecords(),
  ]);
  const citySnapshots = [city.capital, city.development];
  const usableCity = citySnapshots.filter(
    (snapshot) =>
      snapshot.availability === "available" ||
      snapshot.availability === "stale",
  );
  const countyAvailable = county.availability === "available";

  if (!countyAvailable && usableCity.length === 0) {
    return unavailableOverlayResponse(
      "Planning and project records are temporarily unavailable.",
    );
  }

  const features: MapLineFC["features"] = [];
  if (countyAvailable) {
    features.push(
      ...countyPlanningOverlayGeoJson(county.records, {
        checkedAt: county.provenance.checkedAt,
      }).features,
    );
  }
  for (const snapshot of usableCity) {
    features.push(
      ...cityChangeOverlayGeoJson(snapshot.records, {
        checkedAt: snapshot.provenance.dataCheckedAt,
        sourceStatus:
          snapshot.availability === "stale" ? "stale" : "current",
      }).features,
    );
  }

  const cityStatus = citySnapshots.map((snapshot) => snapshot.availability);
  const sourceStatus = usableCity.some(
    (snapshot) => snapshot.availability === "stale",
  )
    ? "stale"
    : "current";
  const checkedAt = oldestIso([
    countyAvailable ? county.provenance.checkedAt : undefined,
    ...usableCity.map((snapshot) => snapshot.provenance.dataCheckedAt),
  ]);
  const sourceAsOf = newestIso([
    county.provenance.latestRecordUpdatedAt,
    ...usableCity.map(
      (snapshot) => snapshot.provenance.latestRecordUpdatedAt,
    ),
  ]);
  const complete =
    countyAvailable &&
    cityStatus.every((status) => status === "available");
  // A successful-but-partial response is useful, but it is not a durable
  // snapshot. Retry it soon so a recovered City or County source does not stay
  // absent behind the normal six-hour edge cache.
  const cacheSeconds = complete ? revalidate : 300;

  return geoJsonOverlayResponse(
    request,
    { type: "FeatureCollection", features },
    cacheSeconds,
    {
      checkedAt,
      sourceAsOf,
      status: sourceStatus,
      coverage: complete ? "complete" : "partial",
    },
  );
}
