/**
 * Bandsintown → live-music events.
 *
 * HONEST CONSTRAINT (do not "fix" by inventing an endpoint): the
 * Bandsintown PUBLIC API is artist-scoped only —
 *   GET https://rest.bandsintown.com/artists/{artist}/events?app_id=…
 * There is NO public "events near a location/area" endpoint; area
 * discovery requires their partner program. So this module cannot do
 * "all live music in Frederick" on its own. Ticketmaster
 * (ticketmaster.ts) is the working area-discovery feed; this one
 * enriches with tour dates for a curated set of local/returning
 * artists when one is supplied.
 *
 * GATED: process.env.BANDSINTOWN_APP_ID (free, server-only). Absent
 * it — or with no artist list — every call returns [], inert (same
 * pattern as the other integrations). Output is the existing LiveEvent
 * shape. We surface only what Bandsintown actually returns.
 */
import type { LngLat } from "@/lib/geo";
import type { LiveEvent } from "@/lib/integrations/ical-live";
import { deriveEventStatus } from "@/lib/event-status";
import { resolveMunicipality } from "@/lib/connect";
import { FREDERICK_COUNTY_BBOX } from "@/lib/integrations/overpass";
import {
  eventAdapterDisabled,
  eventAdapterFailed,
  eventAdapterOk,
  type EventAdapterResult,
} from "@/lib/integrations/event-adapter-result";

const BASE = "https://rest.bandsintown.com/artists";
const FETCH_TIMEOUT_MS = 12_000;

export function bandsintownConfigured(): boolean {
  return (
    process.env.BANDSINTOWN_ENABLED === "1" &&
    Boolean((process.env.BANDSINTOWN_APP_ID ?? "").trim())
  );
}

type BitEvent = {
  id?: string;
  url?: string;
  datetime?: string;
  /** Feed-side event title (often empty) — the one place a publisher
   *  writes "CANCELLED"; our display title is the curated artist name. */
  title?: string;
  venue?: { name?: string; latitude?: number | string; longitude?: number | string; city?: string };
};

function inCounty(lat: number, lng: number): boolean {
  const [s, w, n, e] = FREDERICK_COUNTY_BBOX;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * Pure: normalize a Bandsintown artist-events response to LiveEvent[],
 * keeping only county-coordinate shows with a real datetime. Exported
 * for unit testing without a live app_id.
 */
export function normalizeBandsintown(raw: unknown, artist: string): LiveEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: LiveEvent[] = [];
  for (const ev of raw as BitEvent[]) {
    const when = ev?.datetime;
    if (!ev?.id || !when) continue;
    const lat = Number(ev.venue?.latitude);
    const lng = Number(ev.venue?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCounty(lat, lng)) continue;
    const geom: LngLat = { lng, lat };
    out.push({
      id: `bit-${ev.id}`,
      title: artist,
      description: "",
      starts_at: when,
      ends_at: when,
      venue_name: ev.venue?.name ?? "Live music",
      address: ev.venue?.city ?? "",
      geom,
      municipality: resolveMunicipality(geom).municipality.slug,
      category: "music",
      organizer: ev.venue?.name ?? "Bandsintown",
      source: "bandsintown",
      source_label: "Bandsintown",
      url: ev.url ?? "",
      is_free: false,
      status: deriveEventStatus(ev.title ?? ""),
      last_verified_at: new Date().toISOString(),
    });
  }
  return out;
}

/**
 * Fetch upcoming county shows for a curated artist list. Returns []
 * when no app_id or no artists (inert by design — see the constraint
 * note above). Callers pass the local-artist set; there is no area
 * query to make here.
 */
export async function fetchBandsintownForArtistsResult(
  artists: string[],
): Promise<EventAdapterResult<LiveEvent>> {
  if (process.env.BANDSINTOWN_ENABLED !== "1") return eventAdapterDisabled();
  const appId = (process.env.BANDSINTOWN_APP_ID ?? "").trim();
  if (!appId || artists.length === 0) return eventAdapterDisabled();
  const all: LiveEvent[] = [];
  let failed = 0;
  for (const artist of artists) {
    const url = `${BASE}/${encodeURIComponent(artist)}/events?app_id=${encodeURIComponent(appId)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (res.ok) {
        all.push(...normalizeBandsintown(await res.json(), artist));
      } else {
        failed += 1;
      }
    } catch {
      // one artist failing must not sink the rest
      failed += 1;
    } finally {
      clearTimeout(timer);
    }
  }
  return failed > 0 ? eventAdapterFailed(all) : eventAdapterOk(all);
}

/** Legacy data-only facade. Health-aware callers should use the Result form. */
export async function fetchBandsintownForArtists(
  artists: string[],
): Promise<LiveEvent[]> {
  return (await fetchBandsintownForArtistsResult(artists)).items;
}
