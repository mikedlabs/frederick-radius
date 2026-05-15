/**
 * Geocode events with an address but no coords yet. Spec non-negotiable #4:
 * geocode once on first sight, set geocoded_at, skip thereafter.
 *
 * Spec said Mapbox; we don't have Mapbox — using Google Geocoding API on
 * the existing GOOGLE_PLACES_API_KEY (enable "Geocoding API" in GCP).
 *
 * Venue cache: most events repeat at the same place (city hall, library
 * branches, parks). We check `venue_geocache` by normalized address first
 * and seed it from the app's existing 1,331 curated places, so the very
 * first run already resolves a huge fraction without any API calls.
 */
import type { Sql } from "postgres";
import { normalizeForCache } from "./location";
import { PLACES } from "@/data/places";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const RATE_DELAY_MS = 120; // ~500/min, well under Google limits

export type GeocodeStats = { fromCache: number; fromApi: number; failed: number; seeded: number };

/** One-time-ish: prime venue_geocache from curated PLACES (free, no API). */
export async function seedVenueCache(sql: Sql): Promise<number> {
  const rows = PLACES
    .filter((p) => p.address && p.geom)
    .map((p) => ({
      norm: normalizeForCache(`${p.address}, ${p.city}, MD ${p.postal_code ?? ""}`),
      lat: p.geom.lat,
      lng: p.geom.lng,
    }))
    .filter((r) => r.norm.length > 4);

  let seeded = 0;
  // Chunk to keep statements small for the pooler.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    for (const r of chunk) {
      const res = await sql`
        insert into venue_geocache (norm_address, lat, lng, source)
        values (${r.norm}, ${r.lat}, ${r.lng}, 'curated')
        on conflict (norm_address) do nothing
      `;
      seeded += res.count ?? 0;
    }
  }
  return seeded;
}

async function googleGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(address + ", Maryland")}&region=us&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    const loc = data.results?.[0]?.geometry?.location;
    if (data.status !== "OK" || !loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

export async function geocodePending(sql: Sql, limit = 500): Promise<GeocodeStats> {
  const stats: GeocodeStats = { fromCache: 0, fromApi: 0, failed: 0, seeded: 0 };
  stats.seeded = await seedVenueCache(sql);

  const pending = await sql<{ id: string; address: string }[]>`
    select id, address from ingested_events
    where geocoded_at is null and address is not null and length(address) > 4
    order by starts_at_utc asc
    limit ${limit}
  `;

  for (const ev of pending) {
    const norm = normalizeForCache(ev.address);
    let coords: { lat: number; lng: number } | null = null;

    const cached = await sql<{ lat: number; lng: number }[]>`
      select lat, lng from venue_geocache where norm_address = ${norm} limit 1
    `;
    if (cached.length > 0) {
      coords = { lat: Number(cached[0].lat), lng: Number(cached[0].lng) };
      stats.fromCache++;
    } else {
      coords = await googleGeocode(ev.address);
      if (coords) {
        await sql`
          insert into venue_geocache (norm_address, lat, lng, source)
          values (${norm}, ${coords.lat}, ${coords.lng}, 'google')
          on conflict (norm_address) do nothing
        `;
        stats.fromApi++;
      } else {
        stats.failed++;
      }
      await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    }

    if (coords) {
      await sql`
        update ingested_events
        set lat = ${coords.lat}, lng = ${coords.lng}, geocoded_at = now()
        where id = ${ev.id}
      `;
    }
  }
  return stats;
}
