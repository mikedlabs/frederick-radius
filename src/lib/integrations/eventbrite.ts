/**
 * Eventbrite → live events from a curated organizer registry (data
 * brief, Phase 4, item 4).
 *
 * Eventbrite retired public event search in 2020, but the organizer
 * events endpoint works:
 *   GET https://www.eventbriteapi.com/v3/organizers/{id}/events/
 *       ?status=live&expand=venue&token=…
 * So discovery is "poll the organizers we curate" rather than "search an
 * area". The registry lives in src/data/eventbrite-organizers.ts.
 *
 * GATED ON ONE SECRET: process.env.EVENTBRITE_TOKEN (server-only). Absent
 * it, or with an empty registry, every call returns [], inert, the same
 * contract as the other ticketed adapters.
 *
 * Confidence is `scraped`, set by provenance from the source enum: we
 * curate WHICH organizers we poll, which is a discovery-quality choice,
 * but Eventbrite events are organizer-self-published and we do not review
 * each one, so per-event trust is not partner-level. Only events with a
 * real datetime and county venue coordinates pass the filter.
 */
import type { LngLat } from "@/lib/geo";
import type { LiveEvent } from "@/lib/integrations/ical-live";
import { resolveMunicipality } from "@/lib/connect";
import { FREDERICK_COUNTY_BBOX } from "@/lib/integrations/overpass";
import { EVENTBRITE_ORGANIZERS } from "@/data/eventbrite-organizers";

const BASE = "https://www.eventbriteapi.com/v3/organizers";
const FETCH_TIMEOUT_MS = 15_000;

export function eventbriteConfigured(): boolean {
  return Boolean((process.env.EVENTBRITE_TOKEN ?? "").trim()) && EVENTBRITE_ORGANIZERS.length > 0;
}

type EbVenue = {
  name?: string;
  address?: { city?: string; localized_address_display?: string };
  latitude?: string;
  longitude?: string;
};
type EbEvent = {
  id?: string;
  name?: { text?: string };
  url?: string;
  start?: { utc?: string };
  end?: { utc?: string };
  is_free?: boolean;
  status?: string;
  venue?: EbVenue;
};

function inCounty(lat: number, lng: number): boolean {
  const [s, w, n, e] = FREDERICK_COUNTY_BBOX; // [south, west, north, east]
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * Pure: normalize an Eventbrite organizer-events response (expand=venue)
 * into LiveEvent[], keeping only county-coordinate events with a real
 * datetime. Exported for unit testing without a live token.
 */
export function normalizeEventbrite(raw: unknown): LiveEvent[] {
  const events = (raw as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const out: LiveEvent[] = [];
  for (const ev of events as EbEvent[]) {
    const when = ev?.start?.utc;
    const title = ev?.name?.text;
    if (!ev?.id || !when || !title) continue;
    if (ev.status && ev.status !== "live" && ev.status !== "started") continue;
    const lat = Number(ev.venue?.latitude);
    const lng = Number(ev.venue?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCounty(lat, lng)) continue;
    const geom: LngLat = { lng, lat };
    out.push({
      id: `eb-${ev.id}`,
      title,
      description: "",
      starts_at: when,
      ends_at: ev.end?.utc ?? when,
      venue_name: ev.venue?.name ?? "Eventbrite event",
      address: ev.venue?.address?.localized_address_display ?? ev.venue?.address?.city ?? "",
      geom,
      municipality: resolveMunicipality(geom).municipality.slug,
      category: "community",
      organizer: ev.venue?.name ?? "Eventbrite",
      source: "eventbrite",
      source_label: "Eventbrite",
      url: ev.url ?? "",
      is_free: ev.is_free === true,
      status: "scheduled" as const,
      last_verified_at: new Date().toISOString(),
    });
  }
  return out;
}

/**
 * Poll every organizer in the registry for live events. Returns []
 * (never throws into the events page) when no token or empty registry.
 * Each organizer is fetched independently and fail-soft, so one bad id
 * cannot sink the others.
 */
export async function fetchEventbrite(): Promise<LiveEvent[]> {
  const token = (process.env.EVENTBRITE_TOKEN ?? "").trim();
  if (!token || EVENTBRITE_ORGANIZERS.length === 0) return [];
  const all: LiveEvent[] = [];
  for (const org of EVENTBRITE_ORGANIZERS) {
    const url =
      `${BASE}/${encodeURIComponent(org.id)}/events/` +
      `?status=live&expand=venue&token=${encodeURIComponent(token)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 3600 } });
      if (!res.ok) {
        console.error(`[eventbrite] HTTP ${res.status} for organizer ${org.id}`);
        continue;
      }
      all.push(...normalizeEventbrite(await res.json()));
    } catch (err) {
      console.error(`[eventbrite] fetch failed for organizer ${org.id}:`, err);
    } finally {
      clearTimeout(timer);
    }
  }
  return all;
}
