/**
 * The catalog of live data feeds the app pulls from, and the single
 * place that answers "is this actually collecting data?"
 *
 * Each feed is either KEYLESS (public endpoint — live wherever the
 * network allows) or KEYED (needs an env var set in the deployment;
 * "dark" until then, failing soft to empty so the page never breaks).
 *
 * `feedStatuses()` reads the current process env so /admin/data-health
 * can render a green/amber board: configured feeds vs the exact keys
 * still missing from Vercel. Server-only (touches process.env).
 */
import { GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE } from "@/lib/google-maps-policy";

export type FeedDef = {
  name: string;
  /**
   * Manifest ids this deployment setting applies to. The manifest remains
   * the source catalog; these ids only join configuration evidence to it.
   */
  sourceIds?: readonly string[];
  /** Env var that must be set for the feed to collect. Omitted = keyless. */
  env?: string;
  /** Additional required settings when one credential is not enough. */
  additionalEnvs?: readonly string[];
  /** Explicit switches that must be `1` before this adapter is expected to run. */
  activationEnvs?: readonly string[];
  /** Reviewed policy value that must exist before activation is allowed. */
  policyApproval?: { env: string; value: string };
  /** What this feed powers in the product. */
  powers: string;
  /**
   * Exact County ledger id that must appear in the per-source permission
   * allowlist. Used only with FREDERICK_COUNTY_GIS_REUSE_APPROVED.
   */
  approvedCountySourceId?: string;
};

// KEYED — dark until the env var exists in the deployment.
export const KEYED_FEEDS: FeedDef[] = [
  { name: "Ticketmaster", sourceIds: ["ticketmaster"], env: "TICKETMASTER_API_KEY", powers: "Concerts + Frederick Keys home games" },
  { name: "Bandsintown", sourceIds: ["bandsintown"], env: "BANDSINTOWN_ENABLED", additionalEnvs: ["BANDSINTOWN_APP_ID"], activationEnvs: ["BANDSINTOWN_ENABLED"], powers: "Policy-approved live music by tracked artists" },
  { name: "SeatGeek", sourceIds: ["seatgeek"], env: "SEATGEEK_ENABLED", additionalEnvs: ["SEATGEEK_CLIENT_ID"], activationEnvs: ["SEATGEEK_ENABLED"], powers: "Policy-approved ticketed concerts and shows" },
  { name: "Eventbrite", sourceIds: ["eventbrite_frederick"], env: "EVENTBRITE_ENABLED", additionalEnvs: ["EVENTBRITE_TOKEN"], activationEnvs: ["EVENTBRITE_ENABLED"], powers: "Policy-approved events from a curated organizer registry" },
  {
    name: "Google Places maintenance",
    sourceIds: ["google_places"],
    env: "GOOGLE_PLACES_API_KEY",
    additionalEnvs: [
      "GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL",
      "GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED",
    ],
    activationEnvs: ["GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED"],
    policyApproval: {
      env: "GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL",
      value: GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE,
    },
    powers: "New details, hours, status, and nearby-search collection. Existing attributed photo delivery is separate.",
  },
  {
    name: "Google Routes",
    sourceIds: ["google_routes"],
    env: "GOOGLE_ROUTES_API_KEY",
    additionalEnvs: [
      "GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL",
      "GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED",
      "GOOGLE_ROUTES_ENABLED",
    ],
    activationEnvs: ["GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED", "GOOGLE_ROUTES_ENABLED"],
    policyApproval: {
      env: "GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL",
      value: GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE,
    },
    powers: "Policy-held, non-persistent routed travel estimates",
  },
  { name: "Mapillary", sourceIds: ["mapillary_objects"], env: "MAPILLARY_ENABLED", additionalEnvs: ["MAPILLARY_TOKEN"], activationEnvs: ["MAPILLARY_ENABLED"], powers: "Policy-approved street-object detections" },
  { name: "AirNow", sourceIds: ["airnow"], env: "AIRNOW_API_KEY", powers: "Air-quality index" },
  { name: "National Park Service", sourceIds: ["nps"], env: "NPS_API_KEY", powers: "Park alerts + events (Catoctin, Monocacy)" },
  {
    name: "PulsePoint",
    sourceIds: ["pulsepoint"],
    env: "PULSEPOINT_ENABLED",
    additionalEnvs: ["PULSEPOINT_AGENCY_ID"],
    activationEnvs: ["PULSEPOINT_ENABLED"],
    powers: "Policy-approved, non-medical fire, rescue, and traffic incidents",
  },
  {
    name: "Frederick County food-truck roster",
    sourceIds: ["fc_food_truck_roster"],
    env: "FREDERICK_COUNTY_GIS_REUSE_APPROVED",
    additionalEnvs: ["FREDERICK_COUNTY_GIS_APPROVED_SOURCES"],
    approvedCountySourceId: "fc_food_truck_roster",
    powers: "Official licensed-mobile-unit document discovery",
  },
  {
    name: "Frederick County recreation locations",
    sourceIds: ["fc_recreation_locations"],
    env: "FREDERICK_COUNTY_GIS_REUSE_APPROVED",
    additionalEnvs: ["FREDERICK_COUNTY_GIS_APPROVED_SOURCES"],
    approvedCountySourceId: "fc_recreation_locations",
    powers: "Park, playground, shelter, and recreation-location context",
  },
  {
    name: "Frederick County facilities ingest",
    sourceIds: ["fc_county_facilities"],
    env: "FREDERICK_COUNTY_GIS_REUSE_APPROVED",
    additionalEnvs: ["FREDERICK_COUNTY_GIS_APPROVED_SOURCES"],
    approvedCountySourceId: "fc_county_facilities",
    powers: "Legacy County parks, libraries, and fire-station ingest",
  },
  {
    name: "Parking occupancy",
    sourceIds: ["cof_parking_occupancy"],
    env: "PARKING_OCCUPANCY_ENABLED",
    additionalEnvs: ["PARKING_OCCUPANCY_URL"],
    activationEnvs: ["PARKING_OCCUPANCY_ENABLED"],
    powers:
      "Licensed live garage space counts on /parking and map peeks (PARKING_OCCUPANCY_KEY is optional when the owner feed requires it)",
  },
];

// KEYLESS — public endpoints; live wherever outbound network is allowed.
export const KEYLESS_FEEDS: FeedDef[] = [
  { name: "USGS Water", sourceIds: ["usgs_water"], powers: "River + creek gauge levels" },
  { name: "National Weather Service", sourceIds: ["nws_forecast", "nws_alerts"], powers: "Forecast + weather alerts" },
  {
    name: "Frederick County public GIS",
    sourceIds: [
      "fc_planning_projects",
      "fc_snow_command",
      "fc_parks_assets",
      "fc_high_water",
      "fc_municipal_boundaries",
      "fc_county_parks",
      "fc_park_trails",
      "fc_historic_cemeteries",
    ],
    powers:
      "Municipality outlines, trails, park assets, flood context, planning applications, snow operations, and historic-cemetery discovery",
  },
  { name: "Hood College", sourceIds: ["hood_college"], powers: "Hood events calendar (HOOD_CALENDAR_URL is an optional override)" },
  { name: "FCPS", sourceIds: ["fcps_news"], powers: "School closures and delays (FCPS_FEED_URL is an optional override)" },
  { name: "Overpass / OpenStreetMap", sourceIds: ["osm_overpass"], powers: "Public amenities (restrooms, water, bike parking)" },
  { name: "MDOT CHART", sourceIds: ["mdot_chart"], powers: "Live traffic incidents" },
  {
    name: "Maryland WZDx",
    sourceIds: ["md_wzdx"],
    powers: "Lane-level roadwork and closure geometry under the map's Traffic view",
  },
  {
    name: "Maryland SHA road closures",
    sourceIds: ["md_sha_road_closures"],
    powers:
      "Official current and scheduled closures under the map's Roads Now view",
  },
  {
    name: "City of Frederick walking network",
    sourceIds: ["cof_sidewalks", "cof_path_plan"],
    powers:
      "Sidewalks, ramps, existing paths, and clearly separated planning context in Browse and Outside now",
  },
  {
    name: "City of Frederick change records",
    sourceIds: ["cof_capital_improvement", "cof_development_review"],
    powers:
      "Capital projects and development-review records in the map's What changed view",
  },
  {
    name: "MDOT CHART road intelligence",
    sourceIds: [
      "mdot_chart_tss",
      "mdot_chart_travel",
      "mdot_chart_dms",
      "mdot_chart_rwis",
      "mdot_chart_ips",
      "mdot_chart_sep",
    ],
    powers:
      "Travel times, roadway speeds, message signs, pavement weather, road conditions, and snow-emergency status",
  },
  {
    name: "City and County official alerts",
    sourceIds: ["city_emergency_rss", "county_health_alerts"],
    powers: "Consequence-bearing City emergency and County public-health notices",
  },
  {
    name: "NWS local storm reports",
    sourceIds: ["nws_lsr"],
    powers: "Recent verified hail, wind, flood, snow, and storm-damage reports",
  },
  {
    name: "NOAA nowCOAST lightning density",
    sourceIds: ["nowcoast_lightning"],
    powers:
      "Current 15-minute lightning-density context under the map's existing Weather view",
  },
  { name: "SeeClickFix", sourceIds: ["seeclickfix"], powers: "311 reported issues" },
  { name: "Local news RSS", sourceIds: ["google_news_rss"], powers: "Headlines (Patch, FNP, MD Matters)" },
  { name: "MD Farmers Markets", sourceIds: ["md_farmers_markets"], powers: "Seasonal market listings" },
  { name: "FredScanner", sourceIds: ["fredscanner"], powers: "Live public 911 dispatch incidents (public page; a Slack bot token is an optional realtime upgrade)" },
  { name: "r/frederickmd", sourceIds: ["reddit_frederick"], powers: "Reddit radar for the admin desk (public RSS; Reddit API creds are an optional depth upgrade)" },
  { name: "TransIT Frederick", sourceIds: ["transit_gtfs"], powers: "Bus route shapes" },
  { name: "MARC / rail", sourceIds: ["mta_marc_rt"], powers: "Brunswick-line rail schedule" },
  { name: "Venue live-music calendars", powers: "Live music at breweries, wineries, distilleries & bars (per-venue iCal — see live-music-venues.ts)" },
];

export type FeedStatus = FeedDef & {
  keyless: boolean;
  /** Configuration only. A configured or keyless feed can still be down. */
  configured: boolean;
  /** Exact deployment settings still needed before the adapter may run. */
  missingEnvs: string[];
  /** Setup state only; runtime health is separate evidence. */
  configurationState:
    | "ready"
    | "off"
    | "policy_hold"
    | "setup_needed"
    | "needs_attention";
  configurationNote: string;
};

export function feedStatuses(): { keyed: FeedStatus[]; keyless: FeedStatus[] } {
  const approvedCountySources = new Set(
    (process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return {
    keyed: KEYED_FEEDS.map((f) => {
      const required = [f.env, ...(f.additionalEnvs ?? [])].filter(
        (name): name is string => Boolean(name),
      );
      const missingEnvs = required.filter((name) => {
        const value = process.env[name];
        if (
          name === "FREDERICK_COUNTY_GIS_APPROVED_SOURCES"
          && f.approvedCountySourceId
        ) {
          return !approvedCountySources.has(f.approvedCountySourceId);
        }
        if (name === "GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL") {
          return value?.trim() !== GOOGLE_MAPS_WRITTEN_APPROVAL_VALUE;
        }
        return name.endsWith("_ENABLED") || name.endsWith("_APPROVED")
          ? value !== "1"
          : !value;
      });
      const policyMissing = Boolean(
        f.policyApproval &&
          process.env[f.policyApproval.env]?.trim() !== f.policyApproval.value,
      );
      const activationRequested = (f.activationEnvs ?? []).some(
        (name) => process.env[name] === "1",
      );
      const activationReady =
        (f.activationEnvs ?? []).length > 0 &&
        (f.activationEnvs ?? []).every(
          (name) => process.env[name] === "1",
        );
      const activationOff =
        (f.activationEnvs ?? []).length > 0 && !activationRequested;
      const countySourceAwaitingApproval = Boolean(
        f.approvedCountySourceId &&
          !approvedCountySources.has(f.approvedCountySourceId),
      );
      const missingNonControlSettings = missingEnvs.filter(
        (name) =>
          !(f.activationEnvs ?? []).includes(name) &&
          name !== f.policyApproval?.env &&
          name !== "FREDERICK_COUNTY_GIS_REUSE_APPROVED" &&
          name !== "FREDERICK_COUNTY_GIS_APPROVED_SOURCES",
      );

      let configurationState: FeedStatus["configurationState"];
      let configurationNote: string;
      if (policyMissing || countySourceAwaitingApproval) {
        configurationState = activationRequested ? "needs_attention" : "policy_hold";
        configurationNote = activationRequested
          ? "Activation was requested, but the required policy approval is not recorded."
          : "Held by policy. No runtime failure is implied and activation is not expected yet.";
      } else if (activationOff) {
        configurationState = "off";
        configurationNote = `Intentionally off unless ${(f.activationEnvs ?? []).join(" + ")} is enabled.`;
      } else if ((f.activationEnvs ?? []).length > 0 && !activationReady) {
        configurationState = "needs_attention";
        configurationNote = `Activation is incomplete: ${(f.activationEnvs ?? []).join(" + ")} must all be enabled.`;
      } else if (missingNonControlSettings.length > 0 && activationRequested) {
        configurationState = "needs_attention";
        configurationNote = `Enabled, but incomplete: ${missingNonControlSettings.join(" + ")} is missing.`;
      } else if (missingEnvs.length > 0) {
        configurationState = "setup_needed";
        configurationNote = `Not set up: ${missingEnvs.join(" + ")} is missing.`;
      } else {
        configurationState = "ready";
        configurationNote = "Required settings are present. Runtime evidence still determines whether the source is answering.";
      }
      return {
        ...f,
        keyless: false,
        configured: configurationState === "ready",
        missingEnvs,
        configurationState,
        configurationNote,
      };
    }),
    keyless: KEYLESS_FEEDS.map((f) => ({
      ...f,
      keyless: true,
      configured: true,
      missingEnvs: [],
      configurationState: "ready",
      configurationNote: "No deployment credential is required. Runtime evidence still determines whether the source is answering.",
    })),
  };
}

/** Enabled or partially enabled feeds whose setup cannot currently run. */
export function feedAttentionCount(): number {
  return feedStatuses().keyed.filter(
    (feed) => feed.configurationState === "needs_attention",
  ).length;
}

/** Count of keyed feeds still missing their env var — the headline number. */
export function darkFeedCount(): number {
  return feedStatuses().keyed.filter((feed) => !feed.configured).length;
}
