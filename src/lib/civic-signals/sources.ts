export type CivicSourceStage =
  | "publishing"
  | "connected_pending"
  | "ready_to_join"
  | "source_found"
  | "review_required";

export type CivicSourceReadiness = {
  id: string;
  name: string;
  owner: string;
  topic: string;
  stage: CivicSourceStage;
  statusLabel: string;
  summary: string;
  sourceUrl: string;
  caution?: string;
};

/**
 * A public, client-safe inventory of source readiness.
 *
 * "Source found" is deliberately different from "connected." A readable
 * government map or report is not automatically licensed, stable, complete,
 * comparable, or safe to republish. Keep those distinctions visible here.
 */
export const CIVIC_SOURCE_READINESS: readonly CivicSourceReadiness[] = [
  {
    id: "fcg-fixit",
    name: "FCG FixIt",
    owner: "Frederick County Government",
    topic: "County services",
    stage: "connected_pending",
    statusLabel: "Reuse review pending",
    summary:
      "A privacy-safe countywide aggregate is deployed, but it is not a published finding yet.",
    sourceUrl: "https://www.frederickcountymd.gov/dpwworkrequest-viewer",
    caution:
      "Radius is holding publication until the CC BY-NC-SA reuse terms are cleared for this product.",
  },
  {
    id: "county-parks-assets",
    name: "County parks assets",
    owner: "Frederick County GIS",
    topic: "Public amenities",
    stage: "ready_to_join",
    statusLabel: "Ready for a reviewed join",
    summary:
      "County-managed park assets include seating, drinking water, waste receptacles, bike facilities, toilets, and picnic amenities.",
    sourceUrl:
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer",
    caution:
      "Coverage describes county-managed parks, not every public amenity in the City of Frederick or the county.",
  },
  {
    id: "county-traffic-counts",
    name: "County and state traffic counts",
    owner: "Frederick County GIS and MDOT SHA",
    topic: "Transportation",
    stage: "ready_to_join",
    statusLabel: "Vintage check required",
    summary:
      "Annual traffic counts can add a meaningful exposure measure to corridor and transportation findings.",
    sourceUrl:
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services/DPW/TrafficCount/MapServer",
    caution:
      "A count must retain its survey year and location. Radius will not compare incidents with an undocumented traffic denominator.",
  },
  {
    id: "county-development",
    name: "Residential development pipeline",
    owner: "Frederick County Planning and Permitting",
    topic: "Growth",
    stage: "source_found",
    statusLabel: "Source reconciliation underway",
    summary:
      "Approved, permitted, recorded, and remaining housing units can show where planned growth is moving.",
    sourceUrl: "https://www.frederickcountymd.gov/7988/Data-and-Mapping",
    caution:
      "The current report and GIS layer must agree on their vintage before Radius calculates a trend.",
  },
  {
    id: "government-meetings",
    name: "City and county meeting records",
    owner: "The City of Frederick and Frederick County Government",
    topic: "Public decisions",
    stage: "ready_to_join",
    statusLabel: "Version controls required",
    summary:
      "Agendas, staff reports, attachments, minutes, votes, and video can show what government is considering and what it actually decided.",
    sourceUrl: "https://frederickcountymd.gov/AgendaCenter",
    caution:
      "An agenda item is a proposal. Radius will wait for minutes or a voting record before calling it approved.",
  },
  {
    id: "budgets-contracts-projects",
    name: "Budgets, contracts, and capital projects",
    owner: "The City of Frederick and Frederick County Government",
    topic: "Public money",
    stage: "source_found",
    statusLabel: "Document model needed",
    summary:
      "Adopted budgets, awarded contracts, and project records can connect public dollars with stated purpose and project status.",
    sourceUrl:
      "https://www.frederickcountymd.gov/1116/Current-Awarded-Solicitations",
    caution:
      "Proposed, adopted, amended, encumbered, and actually spent money are different facts and must stay separate.",
  },
  {
    id: "city-development",
    name: "City development review",
    owner: "The City of Frederick",
    topic: "Growth",
    stage: "review_required",
    statusLabel: "Reuse permission needed",
    summary:
      "Planning cases can make proposed changes easier to find by status, date, and area.",
    sourceUrl: "https://cityoffrederickmd.gov/1307/Maps-Apps",
    caution:
      "Radius will not cache or republish City Spires records until the permitted reuse is clear in writing.",
  },
  {
    id: "city-police-stats",
    name: "Frederick Police monthly statistics",
    owner: "Frederick Police Department",
    topic: "Public safety",
    stage: "review_required",
    statusLabel: "Definitions and privacy review",
    summary:
      "Official monthly reports can support broad, delayed descriptions of reported offenses when definitions remain comparable.",
    sourceUrl: "https://www.cityoffrederickmd.gov/484/Crime-Stats",
    caution:
      "No neighborhood rankings, forecasts, exact incident points, or claims that reported calls prove a crime occurred.",
  },
  {
    id: "city-calls-for-service",
    name: "Police calls for service",
    owner: "Frederick Police Department",
    topic: "Public safety",
    stage: "review_required",
    statusLabel: "Approved export or partnership needed",
    summary:
      "The official daily view can describe delayed, broad call patterns if Radius receives a stable approved data path.",
    sourceUrl:
      "https://www.cityoffrederickmd.gov/329/Calls-for-Service---Map",
    caution:
      "Calls for service are requests for police service. They do not establish that a crime occurred.",
  },
  {
    id: "sheriff-reports",
    name: "Sheriff annual reports",
    owner: "Frederick County Sheriff’s Office",
    topic: "Public safety",
    stage: "review_required",
    statusLabel: "Method break review",
    summary:
      "Annual reports can support attributed countywide summaries of agency activity and reported offense categories.",
    sourceUrl: "https://www.frederickcosheriff.com/documents",
    caution:
      "The reporting change from UCR Summary Reporting to NIBRS prevents a simple pre- and post-2022 trend line.",
  },
  {
    id: "weather-air-water",
    name: "Weather, air, and river observations",
    owner: "NWS, AirNow, NOAA, and Frederick County",
    topic: "Environment",
    stage: "ready_to_join",
    statusLabel: "Source hierarchy set",
    summary:
      "Official alerts, regional AQI, local particulate sensors, and river gauges can explain changing outdoor conditions together.",
    sourceUrl: "https://www.frederickcountymd.gov/8659/Air-Quality-Monitoring-Network",
    caution:
      "Health-facing AQI comes from AirNow. Local PurpleAir readings remain labeled as lower-cost sensor observations.",
  },
  {
    id: "county-gis-catalog",
    name: "County GIS service catalog",
    owner: "Frederick County GIS",
    topic: "County operations",
    stage: "source_found",
    statusLabel: "Layer-by-layer review",
    summary:
      "Public works, solid waste, elections, planning, environmental, transit, parks, and public-safety layers share one discoverable catalog.",
    sourceUrl:
      "https://fcgis.frederickcountymd.gov/server_pub/rest/services",
    caution:
      "A public endpoint can still be stale, incomplete, or restricted. Each layer needs its own quality and reuse decision.",
  },
] as const;

export const CIVIC_SOURCE_STAGE_ORDER: readonly CivicSourceStage[] = [
  "publishing",
  "connected_pending",
  "ready_to_join",
  "source_found",
  "review_required",
] as const;
