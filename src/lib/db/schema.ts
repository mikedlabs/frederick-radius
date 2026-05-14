import {
  pgTable, uuid, text, integer, real, boolean, jsonb,
  smallint, timestamp, primaryKey, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const municipalities = pgTable(
  "municipalities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: text("type"),
    population: integer("population"),
    geom: text("geom"),
    centroid: text("centroid"),
    description: text("description"),
    hero_image: text("hero_image"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("municipalities_slug_idx").on(t.slug),
  }),
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parent_id: uuid("parent_id"),
  icon: text("icon"),
  color: text("color"),
  display_order: integer("display_order").default(0),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  facet: text("facet"),
});

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    legal_name: text("legal_name"),
    category_id: uuid("category_id").notNull(),
    subcategory_ids: jsonb("subcategory_ids"),
    description: text("description"),
    short_blurb: text("short_blurb"),
    address: text("address"),
    address_2: text("address_2"),
    city: text("city"),
    state: text("state").default("MD"),
    postal_code: text("postal_code"),
    municipality_id: uuid("municipality_id"),
    neighborhood_id: uuid("neighborhood_id"),
    geom: text("geom").notNull(),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    socials: jsonb("socials"),
    hours: jsonb("hours"),
    hours_text: text("hours_text"),
    price_band: smallint("price_band"),
    amenities: jsonb("amenities"),
    accessibility: jsonb("accessibility"),
    hero_image_id: uuid("hero_image_id"),
    is_verified: boolean("is_verified").default(false),
    verified_at: timestamp("verified_at", { withTimezone: true }),
    claimed_by_id: uuid("claimed_by_id"),
    owner_note: text("owner_note"),
    source_id: uuid("source_id"),
    source_record_id: text("source_record_id"),
    source_fetched_at: timestamp("source_fetched_at", { withTimezone: true }),
    confidence: real("confidence").default(0.5),
    status: text("status").default("active"),
    closed_at: timestamp("closed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex("places_slug_idx").on(t.slug),
    muniIdx: index("places_municipality_idx").on(t.municipality_id),
    catIdx: index("places_category_idx").on(t.category_id),
    // Geometry index created via migration (postgis): CREATE INDEX places_geom_idx ON places USING GIST (geom);
  }),
);

export const placeTags = pgTable(
  "place_tags",
  {
    place_id: uuid("place_id").notNull(),
    tag_id: uuid("tag_id").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.place_id, t.tag_id] }) }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").default("America/New_York"),
    recurrence_rule: text("recurrence_rule"),
    is_all_day: boolean("is_all_day").default(false),
    venue_place_id: uuid("venue_place_id"),
    venue_name: text("venue_name"),
    geom: text("geom"),
    address: text("address"),
    municipality_id: uuid("municipality_id"),
    hero_image_id: uuid("hero_image_id"),
    category_id: uuid("category_id"),
    audience: jsonb("audience"),
    is_free: boolean("is_free").default(false),
    price_text: text("price_text"),
    ticket_url: text("ticket_url"),
    rsvp_url: text("rsvp_url"),
    organizer_id: uuid("organizer_id"),
    status: text("status").default("scheduled"),
    status_note: text("status_note"),
    source_id: uuid("source_id"),
    source_record_id: text("source_record_id"),
    source_fetched_at: timestamp("source_fetched_at", { withTimezone: true }),
    confidence: real("confidence"),
    is_verified: boolean("is_verified").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex("events_slug_idx").on(t.slug),
    timeIdx: index("events_starts_at_idx").on(t.starts_at),
    muniTimeIdx: index("events_muni_starts_idx").on(t.municipality_id, t.starts_at),
  }),
);

export const eventTags = pgTable(
  "event_tags",
  {
    event_id: uuid("event_id").notNull(),
    tag_id: uuid("tag_id").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.event_id, t.tag_id] }) }),
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  name: text("name"),
  avatar_url: text("avatar_url"),
  role: text("role").default("user"),
  device_id: text("device_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
});

export const savedItems = pgTable(
  "saved_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id"),
    device_id: text("device_id"),
    ref_type: text("ref_type").notNull(),
    ref_id: uuid("ref_id").notNull(),
    list_id: uuid("list_id"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    refIdx: index("saved_items_ref_idx").on(t.ref_type, t.ref_id),
  }),
);

export const radii = pgTable("radii", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id"),
  device_id: text("device_id"),
  short_code: text("short_code").notNull().unique(),
  name: text("name"),
  center: text("center").notNull(),
  mode: text("mode"),
  minutes: integer("minutes"),
  meters: integer("meters"),
  filters: jsonb("filters"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const civicAlerts = pgTable("civic_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body"),
  severity: text("severity"),
  source: text("source"),
  affected_geom: text("affected_geom"),
  starts_at: timestamp("starts_at", { withTimezone: true }).defaultNow(),
  ends_at: timestamp("ends_at", { withTimezone: true }),
  link: text("link"),
  is_active: boolean("is_active").default(true),
});

export const dataSources = pgTable("data_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name"),
  type: text("type"),
  url: text("url"),
  enabled: boolean("enabled").default(true),
  last_run_at: timestamp("last_run_at", { withTimezone: true }),
  last_status: text("last_status"),
  config: jsonb("config"),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source_id: uuid("source_id").notNull(),
  started_at: timestamp("started_at", { withTimezone: true }).defaultNow(),
  ended_at: timestamp("ended_at", { withTimezone: true }),
  status: text("status"),
  records_in: integer("records_in"),
  records_upserted: integer("records_upserted"),
  records_failed: integer("records_failed"),
  error: text("error"),
});

// Required PostGIS bootstrap; run once after `drizzle-kit push` against a fresh database.
export const POSTGIS_BOOTSTRAP_SQL = sql`
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  -- After columns exist, convert text geom to geography(Point, 4326):
  -- ALTER TABLE places ALTER COLUMN geom TYPE geography(Point, 4326) USING ST_GeogFromText(geom);
  -- ALTER TABLE events ALTER COLUMN geom TYPE geography(Point, 4326) USING ST_GeogFromText(geom);
  -- CREATE INDEX places_geom_idx ON places USING GIST (geom);
  -- CREATE INDEX events_geom_idx ON events USING GIST (geom);
  -- CREATE INDEX places_name_trgm_idx ON places USING GIN (name gin_trgm_ops);
  -- CREATE INDEX places_fts_idx ON places USING GIN (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
`;
