/**
 * Ticketmaster Discovery API → live-music events for Frederick County.
 *
 * Why: the owner wanted real "who's playing, when" for live-music
 * venues. Google has no events API; Ticketmaster Discovery does, with
 * a genuine geo + classification=Music area search. This is the
 * ToS-clean, non-fabricated path — we surface only what Ticketmaster
 * actually returns.
 *
 * GATED ON ONE SECRET: process.env.TICKETMASTER_API_KEY (free key,
 * server-only, set by a human in .env.local / Vercel — never in code).
 * Absent it, every call returns [] and the module is inert (same
 * pattern as google-places.ts / mapillary.ts).
 *
 * Output is the existing LiveEvent shape so it drops straight into the
 * live-events spine (getLiveEvents → liveToCardEvent → explorer).
 */
import type { LngLat } from "@/lib/geo";
import type { LiveEvent } from "@/lib/integrations/ical-live";
import { resolveMunicipality } from "@/lib/connect";
import { FREDERICK_COUNTY_BBOX } from "@/lib/integrations/overpass";

const ENDPOINT = "https://app.ticketmaster.com/discovery/v2/events.json";
const FETCH_TIMEOUT_MS = 15_000;
// Frederick centroid + a radius that covers the county.
const CENTER = { lat: 39.4143, lng: -77.4105 };
const RADIUS_MI = 25;

export function ticketmasterConfigured(): boolean {
  return Boolean((process.env.TICKETMASTER_API_KEY ?? "").trim());
}

type TmVenue = {
  name?: string;
  city?: { name?: string };
  address?: { line1?: string };
  location?: { latitude?: string; longitude?: string };
};
type TmEvent = {
  id?: string;
  name?: string;
  url?: string;
  dates?: { start?: { dateTime?: string; localDate?: string; localTime?: string } };
  priceRanges?: Array<{ min?: number }>;
  _embedded?: { venues?: TmVenue[] };
};

function inCounty(lat: number, lng: number): boolean {
  const [s, w, n, e] = FREDERICK_COUNTY_BBOX; // [south, west, north, east]
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * Pure: normalize a Ticketmaster Discovery response into LiveEvent[].
 * Anything without a real start time, venue, or in-county coordinate
 * is dropped — never guessed. Exported for unit tests (no live key).
 */
export function normalizeTicketmaster(raw: unknown): LiveEvent[] {
  const events = (raw as { _embedded?: { events?: TmEvent[] } })?._embedded?.events;
  if (!Array.isArray(events)) return [];
  const out: LiveEvent[] = [];
  for (const ev of events) {
    if (!ev?.id || !ev?.name) continue;
    const start = ev.dates?.start?.dateTime;
    if (!start) continue; // no real time → skip, do not fabricate
    const v = ev._embedded?.venues?.[0];
    const lat = Number(v?.location?.latitude);
    const lng = Number(v?.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCounty(lat, lng)) continue;
    const geom: LngLat = { lng, lat };
    const muni = resolveMunicipality(geom);
    const minPrice = ev.priceRanges?.[0]?.min;
    out.push({
      id: `tm-${ev.id}`,
      title: ev.name,
      description: "",
      starts_at: start,
      ends_at: start,
      venue_name: v?.name ?? "Live music",
      address: v?.address?.line1 ?? "",
      geom,
      municipality: muni.municipality.slug,
      category: "music",
      organizer: v?.name ?? "Ticketmaster",
      source: "ticketmaster",
      source_label: "Ticketmaster",
      url: ev.url ?? "",
      is_free: typeof minPrice === "number" && minPrice === 0,
      last_verified_at: new Date().toISOString(),
    });
  }
  return out;
}

/**
 * Fetch upcoming live-music events in Frederick County. Returns []
 * (never throws into the events page) when no key. The key goes in the
 * query (Ticketmaster requires apikey as a param) — server-only module,
 * so it never reaches the client.
 */
export async function fetchTicketmasterMusic(): Promise<LiveEvent[]> {
  const key = (process.env.TICKETMASTER_API_KEY ?? "").trim();
  if (!key) return [];
  const url =
    `${ENDPOINT}?apikey=${encodeURIComponent(key)}` +
    `&classificationName=Music&sort=date,asc&size=100&unit=miles` +
    `&latlong=${CENTER.lat},${CENTER.lng}&radius=${RADIUS_MI}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    return normalizeTicketmaster(await res.json());
  } catch {
    return []; // network/abort/parse — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}
