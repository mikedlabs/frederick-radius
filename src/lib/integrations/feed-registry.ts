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
  /** What this feed powers in the product. */
  powers: string;
};

// KEYED — dark until the env var exists in the deployment.
export const KEYED_FEEDS: FeedDef[] = [
  { name: "Ticketmaster", env: "TICKETMASTER_API_KEY", powers: "Concerts + Frederick Keys home games" },
  { name: "Bandsintown", env: "BANDSINTOWN_APP_ID", powers: "Live music by tracked artists" },
  { name: "SeatGeek", env: "SEATGEEK_CLIENT_ID", powers: "Ticketed concerts + shows near Frederick" },
  { name: "Eventbrite", env: "EVENTBRITE_TOKEN", powers: "Events from a curated organizer registry" },
  { name: "Google Places", env: "GOOGLE_PLACES_API_KEY", powers: "Place details, photos, hours, nearby search" },
  { name: "Mapillary", env: "MAPILLARY_TOKEN", powers: "Street-level imagery + litter points" },
  { name: "AirNow", env: "AIRNOW_API_KEY", powers: "Air-quality index" },
  { name: "National Park Service", env: "NPS_API_KEY", powers: "Park alerts + events (Catoctin, Monocacy)" },
  { name: "Hood College", env: "HOOD_CALENDAR_URL", powers: "Hood events calendar" },
  { name: "FCPS", env: "FCPS_FEED_URL", powers: "Frederick County Public Schools calendar" },
  { name: "PulsePoint", env: "PULSEPOINT_AGENCY_ID", powers: "Live fire / EMS incidents" },
];

// KEYLESS — public endpoints; live wherever outbound network is allowed.
export const KEYLESS_FEEDS: FeedDef[] = [
  { name: "Frederick County GIS", powers: "County boundary, parks, trails, public art" },
  { name: "USGS Water", powers: "River + creek gauge levels" },
  { name: "National Weather Service", powers: "Forecast + weather alerts" },
  { name: "Overpass / OpenStreetMap", powers: "Public amenities (restrooms, water, bike parking)" },
  { name: "MDOT CHART", powers: "Live traffic incidents" },
  { name: "SeeClickFix", powers: "311 reported issues" },
  { name: "Local news RSS", powers: "Headlines (Patch, FNP, MD Matters)" },
  { name: "MD Farmers Markets", powers: "Seasonal market listings" },
  { name: "TransIT Frederick", powers: "Bus route shapes" },
  { name: "MARC / rail", powers: "Brunswick-line rail schedule" },
  { name: "Venue live-music calendars", powers: "Live music at breweries, wineries, distilleries & bars (per-venue iCal — see live-music-venues.ts)" },
];

export type FeedStatus = FeedDef & {
  keyless: boolean;
  /** Keyless feeds are always considered configured. */
  configured: boolean;
};

export function feedStatuses(): { keyed: FeedStatus[]; keyless: FeedStatus[] } {
  return {
    keyed: KEYED_FEEDS.map((f) => ({
      ...f,
      keyless: false,
      configured: Boolean(f.env && process.env[f.env]),
    })),
    keyless: KEYLESS_FEEDS.map((f) => ({ ...f, keyless: true, configured: true })),
  };
}

/** Count of keyed feeds still missing their env var — the headline number. */
export function darkFeedCount(): number {
  return KEYED_FEEDS.filter((f) => !(f.env && process.env[f.env])).length;
}
