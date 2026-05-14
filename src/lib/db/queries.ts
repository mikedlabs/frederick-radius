import { eq, and, gte, lte, sql, isNull, or, desc, asc } from "drizzle-orm";
import { getDb, schema, dbAvailable } from "./client";
import type { Place, DayOfWeek, Hours } from "@/data/places";
import type { Event } from "@/data/events";
import { haversineMeters, type LngLat } from "@/lib/geo";

export { dbAvailable };

type DbPlace = typeof schema.places.$inferSelect;
type DbEvent = typeof schema.events.$inferSelect;

function toPlace(p: DbPlace): Place {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category_slug,
    subcategories: (p.subcategory_slugs as string[] | null) ?? undefined,
    tags: (p.tag_slugs as string[] | null) ?? undefined,
    short_blurb: p.short_blurb ?? "",
    description: p.description ?? undefined,
    address: p.address ?? "",
    city: p.city ?? "Frederick",
    state: "MD",
    postal_code: p.postal_code ?? "",
    municipality: p.municipality_slug ?? "frederick",
    geom: { lng: p.lng, lat: p.lat },
    phone: p.phone ?? undefined,
    website: p.website ?? undefined,
    hours: (p.hours as Partial<Record<DayOfWeek, Hours[DayOfWeek]>> | null) ?? undefined,
    price_band: (p.price_band as 1 | 2 | 3 | 4 | null) ?? undefined,
    amenities: (p.amenities as string[] | null) ?? undefined,
    accessibility: (p.accessibility as Place["accessibility"]) ?? undefined,
    is_verified: p.is_verified ?? false,
    feature_score: p.feature_score ?? 5,
    source: (p.source ?? "seed") as Place["source"],
    updated_at: p.updated_at ? p.updated_at.toISOString().slice(0, 10) : "2026-05-14",
  };
}

function toEvent(e: DbEvent): Event {
  return {
    slug: e.slug,
    title: e.title,
    description: e.description ?? "",
    starts_at: e.starts_at.toISOString(),
    ends_at: (e.ends_at ?? e.starts_at).toISOString(),
    timezone: "America/New_York",
    is_all_day: e.is_all_day ?? false,
    is_recurring: e.is_recurring ?? false,
    recurrence_text: e.recurrence_text ?? undefined,
    venue_place_slug: e.venue_place_slug ?? undefined,
    venue_name: e.venue_name ?? "",
    address: e.address ?? "",
    geom: { lng: e.lng ?? -77.4109, lat: e.lat ?? 39.4143 },
    municipality: e.municipality_slug ?? "frederick",
    category: e.category_slug ?? "arts",
    audience: (e.audience as string[] | null) ?? [],
    is_free: e.is_free ?? false,
    price_text: e.price_text ?? undefined,
    ticket_url: e.ticket_url ?? undefined,
    rsvp_url: e.rsvp_url ?? undefined,
    organizer: e.organizer ?? undefined,
    source: (e.source ?? "seed") as Event["source"],
    is_verified: e.is_verified ?? false,
  };
}

export async function dbGetAllPlaces(): Promise<Place[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(schema.places).where(isNull(schema.places.deleted_at));
  return rows.map(toPlace);
}

export async function dbGetPlaceBySlug(slug: string): Promise<Place | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(schema.places).where(
    and(eq(schema.places.slug, slug), isNull(schema.places.deleted_at)),
  ).limit(1);
  return rows[0] ? toPlace(rows[0]) : null;
}

export async function dbPlacesByMunicipality(slug: string): Promise<Place[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(schema.places).where(
    and(eq(schema.places.municipality_slug, slug), isNull(schema.places.deleted_at)),
  );
  return rows.map(toPlace);
}

export async function dbPlacesByCategory(slug: string): Promise<Place[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(schema.places).where(
    and(
      or(eq(schema.places.category_slug, slug), sql`${schema.places.subcategory_slugs} @> ${JSON.stringify([slug])}::jsonb`),
      isNull(schema.places.deleted_at),
    ),
  );
  return rows.map(toPlace);
}

export async function dbPlacesNear(origin: LngLat, meters: number): Promise<Place[]> {
  const db = getDb();
  if (!db) return [];
  const all = await dbGetAllPlaces();
  return all.filter((p) => haversineMeters(origin, p.geom) <= meters);
}

export async function dbGetAllEvents(): Promise<Event[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(schema.events).where(isNull(schema.events.deleted_at));
  return rows.map(toEvent);
}

export async function dbGetEventBySlug(slug: string): Promise<Event | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(schema.events).where(
    and(eq(schema.events.slug, slug), isNull(schema.events.deleted_at)),
  ).limit(1);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function dbEventsUpcoming(now: Date, limit?: number): Promise<Event[]> {
  const db = getDb();
  if (!db) return [];
  const q = db.select().from(schema.events).where(
    and(gte(schema.events.ends_at, now), isNull(schema.events.deleted_at)),
  ).orderBy(asc(schema.events.starts_at));
  const rows = limit ? await q.limit(limit) : await q;
  return rows.map(toEvent);
}

export async function dbEventsLive(now: Date): Promise<Event[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(schema.events).where(
    and(
      lte(schema.events.starts_at, now),
      gte(schema.events.ends_at, now),
      isNull(schema.events.deleted_at),
    ),
  );
  return rows.map(toEvent);
}

export async function dbEventsByMunicipality(slug: string, futureOnly = true, now = new Date()): Promise<Event[]> {
  const db = getDb();
  if (!db) return [];
  const conds = [eq(schema.events.municipality_slug, slug), isNull(schema.events.deleted_at)];
  if (futureOnly) conds.push(gte(schema.events.ends_at, now));
  const rows = await db.select().from(schema.events)
    .where(and(...conds))
    .orderBy(asc(schema.events.starts_at));
  return rows.map(toEvent);
}

export async function dbEventsAtVenue(placeSlug: string): Promise<Event[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(schema.events).where(
    and(eq(schema.events.venue_place_slug, placeSlug), isNull(schema.events.deleted_at)),
  ).orderBy(asc(schema.events.starts_at));
  return rows.map(toEvent);
}

export async function dbLastIngestRuns(limit = 10) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(schema.ingestRuns)
    .orderBy(desc(schema.ingestRuns.started_at))
    .limit(limit);
}
