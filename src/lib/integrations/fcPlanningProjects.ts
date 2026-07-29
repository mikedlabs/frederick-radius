/**
 * Frederick County open planning applications.
 *
 * The layer says an application is open. It does not say a project is
 * approved, permitted for construction, under construction, or guaranteed to
 * happen. That distinction is represented in every normalized record.
 */
import {
  arcGisDateToIso,
  cleanCountyValue,
  countyHttpUrl,
  countyObjectId,
  countyPolygonGeometry,
  countySnapshot,
  fetchCountyArcGis,
  type CountyArcFeature,
  type CountyDataSnapshot,
  type CountyPolygonGeometry,
  type CountySourceDescriptor,
} from "./fcCountySource";

const SERVICE_URL =
  "https://fcgis.frederickcountymd.gov/server_pub/rest/services/PlanningAndPermitting/PlanningProjects/MapServer";
const ENDPOINT = `${SERVICE_URL}/0/query`;
const CACHE_SECONDS = 21_600;
const OUT_FIELDS = [
  "OBJECTID",
  "PROJNAME",
  "APDESC",
  "Permit",
  "Weblink",
  "CurrentMilestone",
  "CurrentMilestoneDate",
] as const;

export const FC_PLANNING_PROJECTS_SOURCE: CountySourceDescriptor = {
  id: "frederick-county-open-planning-applications",
  ledgerId: "fc_planning_projects",
  title: "Open Planning Applications",
  authority: "Frederick County Government",
  sourceUrl: SERVICE_URL,
  dataUrl: ENDPOINT,
  cacheSeconds: CACHE_SECONDS,
  caveat:
    "An open application is not evidence of approval, active construction, or a completion date.",
};

export type CountyPlanningApplication = {
  id: string;
  name: string;
  applicationType?: string;
  permitId?: string;
  detailsUrl?: string;
  milestone?: string;
  milestoneAt?: string;
  geometry: CountyPolygonGeometry;
  /** Always explicit so a consumer cannot relabel a proposal as construction. */
  lifecycle: "open_application";
  constructionStatus: "not_established";
};

function propertiesOf(feature: CountyArcFeature): Record<string, unknown> {
  return feature.properties && typeof feature.properties === "object"
    ? (feature.properties as Record<string, unknown>)
    : {};
}

/** Pure source-boundary normalization. No unlisted source field survives. */
export function normalizeCountyPlanningApplications(
  features: CountyArcFeature[],
): CountyPlanningApplication[] {
  const records: CountyPlanningApplication[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const properties = propertiesOf(feature);
    const id = countyObjectId(properties.OBJECTID ?? feature.id);
    const name = cleanCountyValue(properties.PROJNAME);
    const geometry = countyPolygonGeometry(feature.geometry);
    if (!id || !name || !geometry || seen.has(id)) continue;
    seen.add(id);

    records.push({
      id: `fc-planning-${id}`,
      name,
      applicationType: cleanCountyValue(properties.APDESC),
      permitId: cleanCountyValue(properties.Permit),
      detailsUrl: countyHttpUrl(properties.Weblink),
      milestone: cleanCountyValue(properties.CurrentMilestone),
      milestoneAt: arcGisDateToIso(properties.CurrentMilestoneDate),
      geometry,
      lifecycle: "open_application",
      constructionStatus: "not_established",
    });
  }

  return records.sort((a, b) => {
    const aTime = a.milestoneAt ? Date.parse(a.milestoneAt) : 0;
    const bTime = b.milestoneAt ? Date.parse(b.milestoneAt) : 0;
    return bTime - aTime || a.name.localeCompare(b.name);
  });
}

export async function getCountyPlanningApplications(): Promise<
  CountyDataSnapshot<CountyPlanningApplication>
> {
  const fetched = await fetchCountyArcGis({
    sourceId: FC_PLANNING_PROJECTS_SOURCE.ledgerId,
    endpoint: ENDPOINT,
    outFields: OUT_FIELDS,
    cacheSeconds: CACHE_SECONDS,
    cacheTag: "fc-planning-projects",
    maxAllowableOffset: 0.00005,
  });
  const records = fetched.ok
    ? normalizeCountyPlanningApplications(fetched.features)
    : [];
  return countySnapshot(FC_PLANNING_PROJECTS_SOURCE, fetched, records);
}
