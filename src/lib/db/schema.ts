import {
  pgTable, uuid, text, integer, real, boolean, jsonb,
  smallint, timestamp, primaryKey, index, uniqueIndex, doublePrecision,
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
    est: integer("est"),
    centroid_lng: doublePrecision("centroid_lng"),
    centroid_lat: doublePrecision("centroid_lat"),
    bbox_min_lng: doublePrecision("bbox_min_lng"),
    bbox_min_lat: doublePrecision("bbox_min_lat"),
    bbox_max_lng: doublePrecision("bbox_max_lng"),
    bbox_max_lat: doublePrecision("bbox_max_lat"),
    description: text("description"),
    hero_blurb: text("hero_blurb"),
    hero_image: text("hero_image"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("municipalities_slug_idx").on(t.slug),
  }),
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    parent_slug: text("parent_slug"),
    icon: text("icon"),
    color: text("color"),
    display_order: integer("display_order").default(0),
    blurb: text("blurb"),
  },
  (t) => ({
    slugIdx: uniqueIndex("categories_slug_idx").on(t.slug),
    parentIdx: index("categories_parent_idx").on(t.parent_slug),
  }),
);

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
    category_slug: text("category_slug").notNull(),
    subcategory_slugs: jsonb("subcategory_slugs").$type<string[]>(),
    tag_slugs: jsonb("tag_slugs").$type<string[]>(),
    description: text("description"),
    short_blurb: text("short_blurb"),
    address: text("address"),
    city: text("city"),
    state: text("state").default("MD"),
    postal_code: text("postal_code"),
    municipality_slug: text("municipality_slug"),
    lng: doublePrecision("lng").notNull(),
    lat: doublePrecision("lat").notNull(),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    socials: jsonb("socials"),
    hours: jsonb("hours"),
    hours_text: text("hours_text"),
    price_band: smallint("price_band"),
    amenities: jsonb("amenities").$type<string[]>(),
    accessibility: jsonb("accessibility"),
    hero_image: text("hero_image"),
    is_verified: boolean("is_verified").default(false),
    verified_at: timestamp("verified_at", { withTimezone: true }),
    feature_score: real("feature_score").default(5.0),
    owner_note: text("owner_note"),
    source: text("source").default("seed"),
    source_record_id: text("source_record_id"),
    source_fetched_at: timestamp("source_fetched_at", { withTimezone: true }),
    confidence: real("confidence").default(1.0),
    status: text("status").default("active"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex("places_slug_idx").on(t.slug),
    muniIdx: index("places_municipality_idx").on(t.municipality_slug),
    catIdx: index("places_category_idx").on(t.category_slug),
    lngLatIdx: index("places_lng_lat_idx").on(t.lng, t.lat),
  }),
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
    is_all_day: boolean("is_all_day").default(false),
    is_recurring: boolean("is_recurring").default(false),
    recurrence_text: text("recurrence_text"),
    venue_place_slug: text("venue_place_slug"),
    venue_name: text("venue_name"),
    lng: doublePrecision("lng"),
    lat: doublePrecision("lat"),
    address: text("address"),
    municipality_slug: text("municipality_slug"),
    hero_image: text("hero_image"),
    category_slug: text("category_slug"),
    audience: jsonb("audience").$type<string[]>(),
    is_free: boolean("is_free").default(false),
    price_text: text("price_text"),
    ticket_url: text("ticket_url"),
    rsvp_url: text("rsvp_url"),
    organizer: text("organizer"),
    status: text("status").default("scheduled"),
    status_note: text("status_note"),
    source: text("source").default("seed"),
    source_record_id: text("source_record_id"),
    source_fetched_at: timestamp("source_fetched_at", { withTimezone: true }),
    confidence: real("confidence").default(1.0),
    is_verified: boolean("is_verified").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex("events_slug_idx").on(t.slug),
    timeIdx: index("events_starts_at_idx").on(t.starts_at),
    muniTimeIdx: index("events_muni_starts_idx").on(t.municipality_slug, t.starts_at),
  }),
);

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

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source_slug: text("source_slug").notNull(),
    started_at: timestamp("started_at", { withTimezone: true }).defaultNow(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    status: text("status"),
    records_in: integer("records_in").default(0),
    records_upserted: integer("records_upserted").default(0),
    records_failed: integer("records_failed").default(0),
    error: text("error"),
  },
  (t) => ({
    sourceTimeIdx: index("ingest_runs_source_time_idx").on(t.source_slug, t.started_at),
  }),
);

export const civicAlerts = pgTable("civic_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body"),
  severity: text("severity"),
  source: text("source"),
  starts_at: timestamp("starts_at", { withTimezone: true }).defaultNow(),
  ends_at: timestamp("ends_at", { withTimezone: true }),
  link: text("link"),
  is_active: boolean("is_active").default(true),
});

export const radii = pgTable("radii", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id"),
  device_id: text("device_id"),
  short_code: text("short_code").notNull().unique(),
  name: text("name"),
  center_lng: doublePrecision("center_lng").notNull(),
  center_lat: doublePrecision("center_lat").notNull(),
  mode: text("mode"),
  minutes: integer("minutes"),
  meters: integer("meters"),
  filters: jsonb("filters"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Run once after migration:
export const POSTGIS_NOTE = sql`-- pg_trgm + FTS indexes (run as raw SQL after migration):
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX places_name_trgm_idx ON places USING GIN (name gin_trgm_ops);
-- CREATE INDEX places_fts_idx ON places USING GIN (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
-- CREATE INDEX events_fts_idx ON events USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));`;
