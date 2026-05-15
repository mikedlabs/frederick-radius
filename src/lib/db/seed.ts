import { sql } from "drizzle-orm";
import { getDb, schema } from "./client";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORIES } from "@/data/categories";
import { TAGS } from "@/data/tags";
import { PLACES } from "@/data/places";
import { EVENTS } from "@/data/events";
import PLACES_DFP from "@/data/places-dfp.json" with { type: "json" };

// Curated places get priority for slug conflicts; DFP fills the long tail.
// We dedupe by checking whether a DFP slug starts with the same name token
// as any curated slug (rough heuristic — better is fine-grained on commit).
const CURATED_SLUGS = new Set(PLACES.map((p) => p.slug));
const DFP_PLACES = (PLACES_DFP as Array<{
  slug: string; name: string; category: string; subcategories?: string[];
  short_blurb: string; address: string; city: string; state: string; postal_code: string;
  municipality: string; geom: { lng: number; lat: number };
  website?: string; phone?: string; instagram?: string;
  price_band?: number; google_place_id?: string;
  is_verified: boolean; hours_verified: boolean; is_operational: string;
  feature_score: number; source: string; updated_at: string;
}>).filter((p) => !CURATED_SLUGS.has(p.slug));

export type SeedSummary = {
  municipalities: number;
  categories: number;
  tags: number;
  places: number;
  places_dfp: number;
  events: number;
  sources: number;
  duration_ms: number;
};

const DATA_SOURCES = [
  { slug: "dfp_ical", name: "Downtown Frederick Partnership", type: "ical", url: "https://downtownfrederick.org/upcoming-events" },
  { slug: "celebrate_frederick", name: "Celebrate Frederick", type: "ical", url: "https://celebratefrederick.com/calendar-of-events" },
  { slug: "frederick_county_calendar", name: "Frederick County Government", type: "ical", url: "https://www.frederickcountymd.gov/Calendar.aspx" },
  { slug: "arcgis_county_facilities", name: "Frederick County ArcGIS", type: "arcgis", url: "https://maps.frederickcountymd.gov/arcgis/rest/services/" },
  { slug: "yelp_fusion", name: "Yelp Fusion API", type: "api", url: "https://api.yelp.com/v3" },
  { slug: "ticketmaster", name: "Ticketmaster Discovery API", type: "api", url: "https://app.ticketmaster.com/discovery/v2" },
  { slug: "nps", name: "National Park Service", type: "api", url: "https://developer.nps.gov/api/v1" },
  { slug: "nws", name: "National Weather Service", type: "api", url: "https://api.weather.gov" },
];

export async function runSeed(): Promise<SeedSummary> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not configured");
  const t0 = Date.now();

  for (const m of MUNICIPALITIES) {
    await db.insert(schema.municipalities).values({
      slug: m.slug,
      name: m.name,
      type: m.type,
      population: m.population,
      est: m.est,
      centroid_lng: m.centroid.lng,
      centroid_lat: m.centroid.lat,
      bbox_min_lng: m.bbox[0],
      bbox_min_lat: m.bbox[1],
      bbox_max_lng: m.bbox[2],
      bbox_max_lat: m.bbox[3],
      description: m.description,
      hero_blurb: m.hero_blurb,
    }).onConflictDoUpdate({
      target: schema.municipalities.slug,
      set: {
        name: m.name, type: m.type, population: m.population, est: m.est,
        centroid_lng: m.centroid.lng, centroid_lat: m.centroid.lat,
        bbox_min_lng: m.bbox[0], bbox_min_lat: m.bbox[1],
        bbox_max_lng: m.bbox[2], bbox_max_lat: m.bbox[3],
        description: m.description, hero_blurb: m.hero_blurb,
      },
    });
  }

  for (const c of CATEGORIES) {
    await db.insert(schema.categories).values({
      slug: c.slug, name: c.name, parent_slug: c.parent ?? null,
      icon: c.icon, color: c.color, display_order: c.display_order, blurb: c.blurb,
    }).onConflictDoUpdate({
      target: schema.categories.slug,
      set: {
        name: c.name, parent_slug: c.parent ?? null,
        icon: c.icon, color: c.color, display_order: c.display_order, blurb: c.blurb,
      },
    });
  }

  for (const t of TAGS) {
    await db.insert(schema.tags).values({
      slug: t.slug, name: t.name, facet: t.facet,
    }).onConflictDoNothing();
  }

  for (const p of PLACES) {
    await db.insert(schema.places).values({
      slug: p.slug,
      name: p.name,
      category_slug: p.category,
      subcategory_slugs: p.subcategories ?? null,
      tag_slugs: p.tags ?? null,
      description: p.description ?? null,
      short_blurb: p.short_blurb,
      address: p.address,
      city: p.city,
      state: "MD",
      postal_code: p.postal_code,
      municipality_slug: p.municipality,
      lng: p.geom.lng,
      lat: p.geom.lat,
      phone: p.phone ?? null,
      website: p.website ?? null,
      hours: p.hours ?? null,
      price_band: p.price_band ?? null,
      amenities: p.amenities ?? null,
      accessibility: p.accessibility ?? null,
      is_verified: p.is_verified,
      feature_score: p.feature_score,
      source: p.source,
      status: "active",
      updated_at: new Date(p.updated_at),
    }).onConflictDoUpdate({
      target: schema.places.slug,
      set: {
        name: p.name, category_slug: p.category,
        subcategory_slugs: p.subcategories ?? null,
        tag_slugs: p.tags ?? null,
        description: p.description ?? null,
        short_blurb: p.short_blurb, address: p.address,
        city: p.city, postal_code: p.postal_code,
        municipality_slug: p.municipality,
        lng: p.geom.lng, lat: p.geom.lat,
        phone: p.phone ?? null, website: p.website ?? null,
        hours: p.hours ?? null, price_band: p.price_band ?? null,
        amenities: p.amenities ?? null, accessibility: p.accessibility ?? null,
        is_verified: p.is_verified, feature_score: p.feature_score,
        updated_at: new Date(p.updated_at),
      },
    });
  }

  // Bulk-insert DFP scraped places — much larger volume, simpler payload.
  // Insert in chunks of 100 to keep query size manageable for the pooler.
  const DFP_CHUNK = 100;
  for (let i = 0; i < DFP_PLACES.length; i += DFP_CHUNK) {
    const chunk = DFP_PLACES.slice(i, i + DFP_CHUNK);
    const rows = chunk.map((p) => ({
      slug: p.slug,
      name: p.name,
      category_slug: p.category,
      subcategory_slugs: p.subcategories && p.subcategories.length > 0 ? p.subcategories : null,
      short_blurb: p.short_blurb,
      address: p.address,
      city: p.city,
      state: "MD",
      postal_code: p.postal_code,
      municipality_slug: p.municipality,
      lng: p.geom.lng,
      lat: p.geom.lat,
      phone: p.phone ?? null,
      website: p.website ?? null,
      price_band: p.price_band ?? null,
      is_verified: false,
      feature_score: p.feature_score,
      source: "manual" as const,
      status: "active" as const,
      updated_at: new Date(p.updated_at),
    }));
    await db.insert(schema.places).values(rows).onConflictDoNothing({
      target: schema.places.slug,
    });
  }

  for (const e of EVENTS) {
    await db.insert(schema.events).values({
      slug: e.slug,
      title: e.title,
      description: e.description,
      starts_at: new Date(e.starts_at),
      ends_at: new Date(e.ends_at),
      timezone: e.timezone,
      is_all_day: e.is_all_day ?? false,
      is_recurring: e.is_recurring ?? false,
      recurrence_text: e.recurrence_text ?? null,
      venue_place_slug: e.venue_place_slug ?? null,
      venue_name: e.venue_name,
      lng: e.geom.lng,
      lat: e.geom.lat,
      address: e.address,
      municipality_slug: e.municipality,
      category_slug: e.category,
      audience: e.audience,
      is_free: e.is_free,
      price_text: e.price_text ?? null,
      ticket_url: e.ticket_url ?? null,
      rsvp_url: e.rsvp_url ?? null,
      organizer: e.organizer ?? null,
      source: e.source,
      is_verified: e.is_verified,
    }).onConflictDoUpdate({
      target: schema.events.slug,
      set: {
        title: e.title, description: e.description,
        starts_at: new Date(e.starts_at), ends_at: new Date(e.ends_at),
        venue_place_slug: e.venue_place_slug ?? null,
        venue_name: e.venue_name, lng: e.geom.lng, lat: e.geom.lat,
        address: e.address, municipality_slug: e.municipality,
        category_slug: e.category, audience: e.audience,
        is_free: e.is_free, price_text: e.price_text ?? null,
        ticket_url: e.ticket_url ?? null, organizer: e.organizer ?? null,
        is_verified: e.is_verified,
      },
    });
  }

  for (const s of DATA_SOURCES) {
    await db.insert(schema.dataSources).values(s).onConflictDoUpdate({
      target: schema.dataSources.slug,
      set: { name: s.name, type: s.type, url: s.url },
    });
  }

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  return {
    municipalities: MUNICIPALITIES.length,
    categories: CATEGORIES.length,
    tags: TAGS.length,
    places: PLACES.length,
    places_dfp: DFP_PLACES.length,
    events: EVENTS.length,
    sources: DATA_SOURCES.length,
    duration_ms: Date.now() - t0,
  };
}
