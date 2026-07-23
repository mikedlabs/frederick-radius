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
export type FeedDef = {
  name: string;
  /** Env var that must be set for the feed to collect. Omitted = keyless. */
  env?: string;
  /** Additional required settings when one credential is not enough. */
  additionalEnvs?: readonly string[];
  /** What this feed powers in the product. */
  powers: string;
};

// KEYED — dark until the env var exists in the deployment.
export const KEYED_FEEDS: FeedDef[] = [
  { name: "Ticketmaster", env: "TICKETMASTER_API_KEY", powers: "Concerts + Frederick Keys home games" },
  { name: "Bandsintown", env: "BANDSINTOWN_ENABLED", additionalEnvs: ["BANDSINTOWN_APP_ID"], powers: "Policy-approved live music by tracked artists" },
  { name: "SeatGeek", env: "SEATGEEK_ENABLED", additionalEnvs: ["SEATGEEK_CLIENT_ID"], powers: "Policy-approved ticketed concerts and shows" },
  { name: "Eventbrite", env: "EVENTBRITE_ENABLED", additionalEnvs: ["EVENTBRITE_TOKEN"], powers: "Policy-approved events from a curated organizer registry" },
  { name: "Google Places", env: "GOOGLE_PLACES_API_KEY", powers: "Place details, photos, hours, nearby search" },
  { name: "Mapillary", env: "MAPILLARY_ENABLED", additionalEnvs: ["MAPILLARY_TOKEN"], powers: "Policy-approved street-object detections" },
  { name: "AirNow", env: "AIRNOW_API_KEY", powers: "Air-quality index" },
  { name: "National Park Service", env: "NPS_API_KEY", powers: "Park alerts + events (Catoctin, Monocacy)" },
  {
    name: "PulsePoint",
    env: "PULSEPOINT_ENABLED",
    additionalEnvs: ["PULSEPOINT_AGENCY_ID"],
    powers: "Policy-approved, non-medical fire, rescue, and traffic incidents",
  },
  { name: "Parking occupancy", env: "PARKING_OCCUPANCY_URL", powers: "Live garage space counts on /parking and map peeks (PARKING_OCCUPANCY_KEY is optional when the owner feed requires it)" },
];

// KEYLESS — public endpoints; live wherever outbound network is allowed.
export const KEYLESS_FEEDS: FeedDef[] = [
  { name: "Frederick County GIS", powers: "County boundary, parks, trails, public art" },
  { name: "USGS Water", powers: "River + creek gauge levels" },
  { name: "National Weather Service", powers: "Forecast + weather alerts" },
  { name: "Hood College", powers: "Hood events calendar (HOOD_CALENDAR_URL is an optional override)" },
  { name: "FCPS", powers: "School closures and delays (FCPS_FEED_URL is an optional override)" },
  { name: "Overpass / OpenStreetMap", powers: "Public amenities (restrooms, water, bike parking)" },
  { name: "MDOT CHART", powers: "Live traffic incidents" },
  { name: "SeeClickFix", powers: "311 reported issues" },
  { name: "Local news RSS", powers: "Headlines (Patch, FNP, MD Matters)" },
  { name: "MD Farmers Markets", powers: "Seasonal market listings" },
  { name: "FredScanner", powers: "Live public 911 dispatch incidents (public page; a Slack bot token is an optional realtime upgrade)" },
  { name: "r/frederickmd", powers: "Reddit radar for the admin desk (public RSS; Reddit API creds are an optional depth upgrade)" },
  { name: "TransIT Frederick", powers: "Bus route shapes" },
  { name: "MARC / rail", powers: "Brunswick-line rail schedule" },
  { name: "Venue live-music calendars", powers: "Live music at breweries, wineries, distilleries & bars (per-venue iCal — see live-music-venues.ts)" },
];

export type FeedStatus = FeedDef & {
  keyless: boolean;
  /** Configuration only. A configured or keyless feed can still be down. */
  configured: boolean;
  /** Exact deployment settings still needed before the adapter may run. */
  missingEnvs: string[];
};

export function feedStatuses(): { keyed: FeedStatus[]; keyless: FeedStatus[] } {
  return {
    keyed: KEYED_FEEDS.map((f) => {
      const required = [f.env, ...(f.additionalEnvs ?? [])].filter(
        (name): name is string => Boolean(name),
      );
      const missingEnvs = required.filter((name) => {
        const value = process.env[name];
        return name.endsWith("_ENABLED") ? value !== "1" : !value;
      });
      return {
        ...f,
        keyless: false,
        configured: missingEnvs.length === 0,
        missingEnvs,
      };
    }),
    keyless: KEYLESS_FEEDS.map((f) => ({
      ...f,
      keyless: true,
      configured: true,
      missingEnvs: [],
    })),
  };
}

/** Count of keyed feeds still missing their env var — the headline number. */
export function darkFeedCount(): number {
  return feedStatuses().keyed.filter((feed) => !feed.configured).length;
}
