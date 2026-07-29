import {
  FREDERICK_COUNTY_PUBLIC_RUNTIME_SOURCE_IDS,
  type FrederickCountyApprovableSourceId,
} from "@/lib/integrations/fcCountySource";

export type CountyHealthEndpoint = {
  group: string;
  sourceId: FrederickCountyApprovableSourceId;
  url: string;
  critical: false;
  method: "GET";
};

function queryUrl(base: string, outFields: string): string {
  const url = new URL(base);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", "1");
  url.searchParams.set("f", "json");
  return url.toString();
}

const ENDPOINTS_BY_SOURCE: Readonly<
  Record<FrederickCountyApprovableSourceId, CountyHealthEndpoint[]>
> = {
  fc_planning_projects: [{
    group: "County planning applications",
    sourceId: "fc_planning_projects",
    url: queryUrl(
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services/PlanningAndPermitting/PlanningProjects/MapServer/0/query",
      "OBJECTID,PROJNAME",
    ),
    critical: false,
    method: "GET",
  }],
  fc_snow_command: [{
    group: "County snow operations",
    sourceId: "fc_snow_command",
    url: queryUrl(
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services/FeatureServices/SnowCommand/FeatureServer/0/query",
      "OBJECTID,STATUS,TIMESTAMP",
    ),
    critical: false,
    method: "GET",
  }],
  fc_parks_assets: [
    {
      group: "County park benches",
      sourceId: "fc_parks_assets",
      url: queryUrl(
        "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer/1/query",
        "OBJECTID,ParkName",
      ),
      critical: false,
      method: "GET",
    },
    {
      group: "County park amenities",
      sourceId: "fc_parks_assets",
      url: queryUrl(
        "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer/6/query",
        "OBJECTID,ParkName,Type1",
      ),
      critical: false,
      method: "GET",
    },
  ],
  fc_high_water: [
    {
      group: "County high-water areas",
      sourceId: "fc_high_water",
      url: queryUrl(
        "https://fcgis.frederickcountymd.gov/server_pub/rest/services/DPW/High_Water_Areas/MapServer/0/query",
        "OBJECTID,CREEK",
      ),
      critical: false,
      method: "GET",
    },
    {
      group: "County flood warning signs",
      sourceId: "fc_high_water",
      url: queryUrl(
        "https://fcgis.frederickcountymd.gov/server_pub/rest/services/PublicSafety/RoadwayFloodPoints/MapServer/1/query",
        "OBJECTID,CREEK",
      ),
      critical: false,
      method: "GET",
    },
    {
      group: "County past water rescues",
      sourceId: "fc_high_water",
      url: queryUrl(
        "https://fcgis.frederickcountymd.gov/server_pub/rest/services/PublicSafety/RoadwayFloodPoints/MapServer/2/query",
        "OBJECTID,CREEK",
      ),
      critical: false,
      method: "GET",
    },
  ],
  fc_food_truck_roster: [{
    group: "County licensed food-truck roster",
    sourceId: "fc_food_truck_roster",
    url: "https://health.frederickcountymd.gov/695/Mobile-UnitsFood-Trucks",
    critical: false,
    method: "GET",
  }],
  fc_municipal_boundaries: [{
    group: "County municipal boundaries",
    sourceId: "fc_municipal_boundaries",
    url: queryUrl(
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services/Basemap/Municipalities/MapServer/0/query",
      "OBJECTID,MUNIC",
    ),
    critical: false,
    method: "GET",
  }],
  fc_county_parks: [{
    group: "County park points",
    sourceId: "fc_county_parks",
    url: queryUrl(
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Parks/MapServer/0/query",
      "OBJECTID,Name",
    ),
    critical: false,
    method: "GET",
  }],
  fc_park_trails: [{
    group: "County park trails",
    sourceId: "fc_park_trails",
    url: queryUrl(
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer/12/query",
      "OBJECTID,ParkName",
    ),
    critical: false,
    method: "GET",
  }],
  fc_historic_cemeteries: [{
    group: "County historic cemeteries",
    sourceId: "fc_historic_cemeteries",
    url: queryUrl(
      "https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/HistoricCemeteries/FeatureServer/0/query",
      "FID,Name",
    ),
    critical: false,
    method: "GET",
  }],
  fc_recreation_locations: [{
    group: "County recreation locations",
    sourceId: "fc_recreation_locations",
    url: queryUrl(
      "https://services5.arcgis.com/o8KSxSzYaulbGcFX/arcgis/rest/services/survey123_4590893d5fdc4e6ab6d653f985715200_results/FeatureServer/0/query",
      "objectid,name,type",
    ),
    critical: false,
    method: "GET",
  }],
  // The legacy maps.frederickcountymd.gov host is currently dead. Keep the
  // source permission-gated, but do not add a health probe that would turn a
  // known 404 into recurring noise.
  fc_county_facilities: [],
};

/**
 * Health checks mirror the runtime boundary. Official public GIS is checked
 * by default; source-specific approval adds only the gated sources named in
 * the allowlist.
 */
export function approvedCountyHealthEndpoints(
  masterApproved = process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED,
  sourceAllowlist = process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES,
  publicGisEnabled = process.env.FREDERICK_COUNTY_GIS_ENABLED,
): CountyHealthEndpoint[] {
  const approved = new Set<string>(
    publicGisEnabled === "0"
      ? []
      : FREDERICK_COUNTY_PUBLIC_RUNTIME_SOURCE_IDS,
  );
  if (masterApproved === "1") {
    for (const sourceId of (sourceAllowlist ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)) {
      approved.add(sourceId);
    }
  }
  return Object.entries(ENDPOINTS_BY_SOURCE).flatMap(([sourceId, endpoints]) =>
    approved.has(sourceId) ? endpoints : [],
  );
}
