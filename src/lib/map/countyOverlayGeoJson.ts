import type { MapLineFC } from "@/components/map/types";
import type { CountyPark } from "@/lib/integrations/fcGis";
import {
  FC_PLANNING_PROJECTS_SOURCE,
  type CountyPlanningApplication,
} from "@/lib/integrations/fcPlanningProjects";
import { cleanCountyValue } from "@/lib/integrations/fcCountySource";
import { slimGeometryFC } from "@/lib/geo/slim-geometry";

/** Official layer page, not a Radius-owned mirror. */
export const FC_COUNTY_PARKS_SOURCE_URL =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Parks/MapServer/0";

export const COUNTY_PARK_CAVEAT =
  "A mapped park does not confirm that its facilities are open or available right now.";

const PLANNING_DISPLAY_SLIM = {
  decimals: 5,
  // Roughly 22 m: below the visible width of a parcel outline at the zooms
  // where a county-wide application layer is useful, and much smaller than
  // the source polygons' decision-making precision.
  tolerance: 0.0002,
} as const;

function stablePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function validCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Turn the already allowlisted County park records into the small same-origin
 * GeoJSON contract consumed by MapOverlays. No upstream-only field survives.
 */
export function countyParksOverlayGeoJson(parks: CountyPark[]): MapLineFC {
  const features: MapLineFC["features"] = [];

  for (const park of parks) {
    const name = cleanCountyValue(park.name);
    if (!name || !validCoordinate(park.lng) || !validCoordinate(park.lat)) {
      continue;
    }
    const address = cleanCountyValue(park.address);
    const municipality = cleanCountyValue(park.municipality);
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [park.lng, park.lat],
      },
      properties: {
        id: `fc-county-park-${stablePart(name)}-${park.lng.toFixed(5)}-${park.lat.toFixed(5)}`,
        name,
        ...(address ? { address } : {}),
        ...(municipality ? { municipality } : {}),
        source_label: "Frederick County Government",
        source_url: FC_COUNTY_PARKS_SOURCE_URL,
        caveat: COUNTY_PARK_CAVEAT,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

/**
 * Convert current/open applications to display GeoJSON. Lifecycle language is
 * explicit in every feature so a consumer cannot quietly relabel a proposal as
 * approved work or active construction. Geometry is simplified for display,
 * not measurement, before it crosses the browser boundary.
 */
export function countyPlanningOverlayGeoJson(
  applications: CountyPlanningApplication[],
  provenance: { checkedAt?: string } = {},
): MapLineFC {
  const features: MapLineFC["features"] = [];

  for (const application of applications) {
    const id = cleanCountyValue(application.id);
    const name = cleanCountyValue(application.name);
    if (!id || !name || application.lifecycle !== "open_application") continue;

    const applicationType = cleanCountyValue(application.applicationType);
    const permitId = cleanCountyValue(application.permitId);
    const milestone = cleanCountyValue(application.milestone);
    features.push({
      type: "Feature",
      geometry: application.geometry,
      properties: {
        id,
        name,
        record_kind: "county_open_application",
        popup_label: "County planning application",
        status_label: "Open application",
        lifecycle: "open_application",
        construction_status: "not_established",
        ...(applicationType ? { application_type: applicationType } : {}),
        ...(permitId ? { permit_id: permitId } : {}),
        ...(milestone ? { milestone } : {}),
        ...(application.milestoneAt
          ? { milestone_at: application.milestoneAt }
          : {}),
        ...(application.detailsUrl ? { details_url: application.detailsUrl } : {}),
        source_label: FC_PLANNING_PROJECTS_SOURCE.authority,
        source_url: FC_PLANNING_PROJECTS_SOURCE.sourceUrl,
        ...(provenance.checkedAt ? { checked_at: provenance.checkedAt } : {}),
        caveat: FC_PLANNING_PROJECTS_SOURCE.caveat,
      },
    });
  }

  return slimGeometryFC(
    { type: "FeatureCollection", features },
    PLANNING_DISPLAY_SLIM,
  );
}
