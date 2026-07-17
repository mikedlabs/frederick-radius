/**
 * SeatGeek → live ticketed events in Frederick County.
 *
 * Closes the commercial-music coverage gap alongside Ticketmaster (data
 * brief, Phase 4, item 3). SeatGeek's public events endpoint is
 * area-discovery, like Ticketmaster and unlike Bandsintown's
 * artist-scoping, so it can answer "ticketed shows near Frederick" on
 * its own:
 *   GET https://api.seatgeek.com/2/events?client_id=…&lat=…&lon=…&range=25mi
 *
 * GATED ON ONE SECRET: process.env.SEATGEEK_CLIENT_ID (free, server-only).
 * Absent it, every call returns [], inert, the same contract as the
 * Ticketmaster and Bandsintown adapters. Output is the existing LiveEvent
 * shape so it drops straight into the live-events spine
 * (assembleUnifiedEvents → liveToCardEvent → explorer), and provenance
 * stamps it at the verified tier because these are ticketed listings.
 *
 * This module makes no claim SeatGeek does not return: only events with a
 * real datetime and county coordinates pass the filter.
 */
import type { LngLat } from "@/lib/geo";
import type { LiveEvent } from "@/lib/integrations/ical-live";
import { allowedEventImage, ticketFloorText } from "@/lib/integrations/ticketmaster";
import { MUNICIPALITIES } from "@/data/municipalities";
import { resolveMunicipality } from "@/lib/connect";
import { FREDERICK_COUNTY_BBOX } from "@/lib/integrations/overpass";

const ENDPOINT = "https://api.seatgeek.com/2/events";
const FETCH_TIMEOUT_MS = 15_000;
// Frederick centroid + a radius that covers the county, matching the
// Ticketmaster adapter so the two area queries agree on scope.
const CENTER = { lat: 39.4143, lng: -77.4105 };
const RANGE = "25mi";

export function seatgeekConfigured(): boolean {
  return Boolean((process.env.SEATGEEK_CLIENT_ID ?? "").trim());
}

type SgVenue = {
  name?: string;
  city?: string;
  address?: string;
  location?: { lat?: number; lon?: number };
};
type SgEvent = {
  id?: number;
  title?: string;
  url?: string;
  datetime_local?: string;
  datetime_utc?: string;
  venue?: SgVenue;
  stats?: { lowest_price?: number | null };
  taxonomies?: Array<{ name?: string }>;
  performers?: Array<{ image?: string | null }>;
};

function inCounty(lat: number, lng: number): boolean {
  const [s, w, n, e] = FREDERICK_COUNTY_BBOX; // [south, west, north, east]
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * Resolve the municipality for a venue. SeatGeek venue coordinates can be
 * coarse, so the editorial `city` field is matched first, falling back to
 * the coordinate resolver only when the city is unknown. Same approach as
 * the Ticketmaster adapter, for the same Weinberg-resolved-to-Walkersville
 * reason.
 */
function municipalityFor(cityName: string | undefined, geom: LngLat): string {
  const city = (cityName ?? "").trim().toLowerCase();
  if (city) {
    const named = MUNICIPALITIES.find((m) => {
      const n = m.name.toLowerCase();
      return n === city || n.includes(city);
    });
    if (named) return named.slug;
  }
  return resolveMunicipality(geom).municipality.slug;
}

/** Map a SeatGeek taxonomy to our event category. SeatGeek's top-level
 *  taxonomies (concert, theater, sports, comedy) map cleanly. Anything else
 *  is "community", NOT music: the old music fallback stamped SeatGeek's
 *  community listings (rec-center classes like "Cardio Sculpt" and "Senior
 *  Exercise") as concerts, and they rendered on the live-music radar
 *  (2026-07-17 screenshot review). Music now requires SeatGeek to say so. */
function categoryFor(taxonomies: SgEvent["taxonomies"]): string {
  const names = (taxonomies ?? []).map((t) => (t.name ?? "").toLowerCase());
  if (names.some((n) => n.includes("theater") || n.includes("theatre"))) return "theater";
  if (names.some((n) => n.includes("comedy"))) return "theater";
  if (names.some((n) => n.includes("sports"))) return "sports";
  if (names.some((n) => n.includes("concert") || n.includes("music"))) return "music";
  return "community";
}

/**
 * Pure: normalize a SeatGeek events response into LiveEvent[], keeping
 * only county-coordinate shows with a real datetime. Exported for unit
 * testing without a live client id.
 */
export function normalizeSeatGeek(raw: unknown): LiveEvent[] {
  const events = (raw as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const out: LiveEvent[] = [];
  for (const ev of events as SgEvent[]) {
    const when = ev?.datetime_utc ?? ev?.datetime_local;
    if (!ev?.id || !when || !ev.title) continue;
    const lat = Number(ev.venue?.location?.lat);
    const lng = Number(ev.venue?.location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCounty(lat, lng)) continue;
    const geom: LngLat = { lng, lat };
    const lowest = ev.stats?.lowest_price;
    out.push({
      id: `sg-${ev.id}`,
      title: ev.title,
      description: "",
      starts_at: when,
      ends_at: when,
      venue_name: ev.venue?.name ?? "Live event",
      address: ev.venue?.address ?? ev.venue?.city ?? "",
      geom,
      municipality: municipalityFor(ev.venue?.city, geom),
      category: categoryFor(ev.taxonomies),
      organizer: ev.venue?.name ?? "SeatGeek",
      source: "seatgeek",
      source_label: "SeatGeek",
      url: ev.url ?? "",
      // A lowest_price of exactly 0 is free; null or absent means the
      // price is unknown, not free, so only an explicit 0 sets the flag.
      is_free: typeof lowest === "number" && lowest === 0,
      price_text: ticketFloorText(lowest ?? undefined),
      hero_image: allowedEventImage(ev.performers?.find((p) => p?.image)?.image),
      status: "scheduled" as const,
      last_verified_at: new Date().toISOString(),
    });
  }
  return out;
}

/**
 * Fetch upcoming ticketed events in Frederick County. Returns [] (never
 * throws into the events page) when no client id. The id goes in the
 * query (SeatGeek requires client_id as a param) on a server-only module,
 * so it never reaches the client.
 */
export async function fetchSeatGeek(): Promise<LiveEvent[]> {
  const clientId = (process.env.SEATGEEK_CLIENT_ID ?? "").trim();
  if (!clientId) return [];
  const url =
    `${ENDPOINT}?client_id=${encodeURIComponent(clientId)}` +
    `&lat=${CENTER.lat}&lon=${CENTER.lng}&range=${RANGE}` +
    `&per_page=100&sort=datetime_utc.asc`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[seatgeek] HTTP ${res.status}`);
      return [];
    }
    return normalizeSeatGeek(await res.json());
  } catch (err) {
    console.warn("[seatgeek] fetch failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
