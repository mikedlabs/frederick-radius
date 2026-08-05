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
import { deriveEventStatus, stripStatusMarker, type EventStatus } from "@/lib/event-status";
import { resolveMunicipality } from "@/lib/connect";
import { FREDERICK_COUNTY_BBOX } from "@/lib/integrations/overpass";
import { MUNICIPALITIES } from "@/data/municipalities";
import {
  eventAdapterDisabled,
  eventAdapterFailed,
  eventAdapterOk,
  type EventAdapterResult,
} from "@/lib/integrations/event-adapter-result";

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
  /** Ticketmaster's editorial blurb for the event, when the promoter wrote one. */
  info?: string;
  /** Logistics note ("doors at 7", "clear bag policy"). Real information for
   *  a person deciding to go; joined after info. */
  pleaseNote?: string;
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string };
    status?: { code?: string };
  };
  priceRanges?: Array<{ min?: number }>;
  images?: Array<{ url?: string; width?: number; ratio?: string }>;
  _embedded?: {
    venues?: TmVenue[];
    /** The bill: headliner plus support. The event name usually carries the
     *  headliner; names beyond the first are the support acts. */
    attractions?: Array<{ name?: string }>;
  };
};

/** The support acts as one plain sentence, or undefined when the bill is just
 *  the headliner. The first attraction is the headliner the title already
 *  names; repeating it would say the same thing twice. */
export function tmLineupSentence(
  attractions: NonNullable<TmEvent["_embedded"]>["attractions"],
): string | undefined {
  const names = (attractions ?? [])
    .map((a) => a?.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (names.length < 2) return undefined;
  const support = names.slice(1);
  return `With ${support.join(", ")}.`;
}

/** Description from the fields Ticketmaster actually publishes: the editorial
 *  blurb, the logistics note, and the support lineup, joined as sentences.
 *  Empty when the promoter wrote nothing — never fabricated. */
export function tmDescription(ev: TmEvent): string {
  return [ev.info?.trim(), ev.pleaseNote?.trim(), tmLineupSentence(ev._embedded?.attractions)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** "From $28" / "From $28.50" — only when the feed publishes a real floor
 *  above zero (zero means free and is_free already owns that). */
export function ticketFloorText(min: number | undefined): string | undefined {
  if (typeof min !== "number" || !Number.isFinite(min) || min <= 0) return undefined;
  return `From $${Number.isInteger(min) ? min : min.toFixed(2)}`;
}

/**
 * Hosts next.config.ts allowlists for event hero images. The adapters
 * emit hero_image ONLY for these, so an unexpected CDN in a feed
 * response silently drops the image rather than crashing next/image
 * (an off-list host throws at render). Keep in sync with next.config.
 */
export const EVENT_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  "s1.ticketm.net",
  "seatgeek.com",
]);

export function allowedEventImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && EVENT_IMAGE_HOSTS.has(u.hostname) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Best card image from Ticketmaster's size ladder: prefer 16:9 near the
 *  card's ~640px render width, fall back to the widest image of any ratio.
 *  Only allowlisted hosts survive. Undefined when nothing usable. */
export function pickTmImage(images: TmEvent["images"]): string | undefined {
  const usable = (images ?? []).filter(
    (i) => allowedEventImage(i?.url) && (i.width ?? 0) >= 300,
  );
  if (usable.length === 0) return undefined;
  const wide = usable.filter((i) => i.ratio === "16_9");
  const pool = wide.length > 0 ? wide : usable;
  const scored = [...pool].sort(
    (a, b) => Math.abs((a.width ?? 0) - 640) - Math.abs((b.width ?? 0) - 640),
  );
  return scored[0]?.url;
}

/**
 * Lifecycle status for a Ticketmaster row. The structured
 * dates.status.code is authoritative when it says cancelled/postponed;
 * "rescheduled" means a NEW date is set and dates.start already carries
 * it, so the event is still on. Title sniff fills the gap for venues
 * that only edit the name (same fallback the iCal lane uses).
 */
function tmStatus(ev: TmEvent): EventStatus {
  const code = (ev.dates?.status?.code ?? "").trim().toLowerCase();
  if (code === "cancelled" || code === "canceled") return "cancelled";
  if (code === "postponed") return "postponed";
  return deriveEventStatus(ev.name ?? "");
}

function inCounty(lat: number, lng: number): boolean {
  const [s, w, n, e] = FREDERICK_COUNTY_BBOX; // [south, west, north, east]
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * Resolve the municipality for a venue. Ticketmaster venue coordinates
 * are coarse: a downtown venue can geocode a few miles off, far enough
 * for resolveMunicipality() to pick the wrong town (the Weinberg Center
 * resolved to Walkersville). The venue's editorial `city` field is more
 * reliable, so match a municipality by name first, falling back to the
 * coordinate resolver only when the city is unknown.
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
    const municipality = municipalityFor(v?.city?.name, geom);
    const minPrice = ev.priceRanges?.[0]?.min;
    const status = tmStatus(ev);
    out.push({
      id: `tm-${ev.id}`,
      title: status === "scheduled" ? ev.name : stripStatusMarker(ev.name),
      description: tmDescription(ev),
      starts_at: start,
      ends_at: start,
      venue_name: v?.name ?? "Live music",
      address: v?.address?.line1 ?? "",
      geom,
      municipality,
      category: "music",
      organizer: v?.name ?? "Ticketmaster",
      source: "ticketmaster",
      source_label: "Ticketmaster",
      url: ev.url ?? "",
      is_free: typeof minPrice === "number" && minPrice === 0,
      price_text: ticketFloorText(minPrice),
      hero_image: pickTmImage(ev.images),
      status,
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
export async function fetchTicketmasterMusicResult(): Promise<
  EventAdapterResult<LiveEvent>
> {
  const key = (process.env.TICKETMASTER_API_KEY ?? "").trim();
  if (!key) return eventAdapterDisabled();
  const url =
    `${ENDPOINT}?apikey=${encodeURIComponent(key)}` +
    `&classificationName=Music&sort=date,asc&size=100&unit=miles` +
    `&latlong=${CENTER.lat},${CENTER.lng}&radius=${RADIUS_MI}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return eventAdapterFailed();
    return eventAdapterOk(normalizeTicketmaster(await res.json()));
  } catch {
    return eventAdapterFailed();
  } finally {
    clearTimeout(timer);
  }
}

/** Legacy data-only facade. Health-aware callers should use the Result form. */
export async function fetchTicketmasterMusic(): Promise<LiveEvent[]> {
  return (await fetchTicketmasterMusicResult()).items;
}

/**
 * Fetch upcoming sports events in Frederick County — primarily the
 * Frederick Keys (MiLB, Carolina League) at Nymeo Field at Harry
 * Grove Stadium, but anything else Ticketmaster classifies as
 * Sports inside the geo window lands here too (Hood athletics
 * tournaments, occasional college matchups). Same shape, same
 * normalize path, same county-bbox filter as fetchTicketmasterMusic.
 *
 * Category override: normalizeTicketmaster() hardcodes "music" for
 * every event it returns (the helper predates this function). Sports
 * results need the "sports" category so they fall under the right
 * keyword bucket on the events explorer. We override the category
 * here after the normalize pass — the keyword inference in
 * ical-live.ts already maps the sport-specific words (keys, baseball,
 * tournament, vs.) to "sports" too, but a Keys vs. Salem game whose
 * title doesn't trip any of those would otherwise read as "music."
 */
export async function fetchTicketmasterSportsResult(): Promise<
  EventAdapterResult<LiveEvent>
> {
  const key = (process.env.TICKETMASTER_API_KEY ?? "").trim();
  if (!key) return eventAdapterDisabled();
  const url =
    `${ENDPOINT}?apikey=${encodeURIComponent(key)}` +
    `&classificationName=Sports&sort=date,asc&size=100&unit=miles` +
    `&latlong=${CENTER.lat},${CENTER.lng}&radius=${RADIUS_MI}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return eventAdapterFailed();
    const events = normalizeTicketmaster(await res.json());
    return eventAdapterOk(events.map((e) => ({ ...e, category: "sports" })));
  } catch {
    return eventAdapterFailed();
  } finally {
    clearTimeout(timer);
  }
}

/** Legacy data-only facade. Health-aware callers should use the Result form. */
export async function fetchTicketmasterSports(): Promise<LiveEvent[]> {
  return (await fetchTicketmasterSportsResult()).items;
}
