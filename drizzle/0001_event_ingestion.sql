-- Event ingestion pipeline (CivicEngage iCal → normalized, geocoded events)
-- Per spec. NOTE: spec's "events" table is renamed "ingested_events" to avoid
-- colliding with the existing app `events` table; the app unions both via a
-- loader adapter. raw_events keeps the source-of-truth VEVENT.

-- Staging: one row per VEVENT pulled, raw payload preserved
CREATE TABLE IF NOT EXISTS raw_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_domain   text NOT NULL,
  source_uid      text NOT NULL,
  source_url      text,
  raw_vevent      text NOT NULL,
  dtstamp         timestamptz NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_events_source_unique UNIQUE (source_domain, source_uid)
);

-- Normalized: one row per logical event, geocoded
CREATE TABLE IF NOT EXISTS ingested_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_event_id      uuid NOT NULL REFERENCES raw_events(id) ON DELETE CASCADE,
  source_domain     text NOT NULL,
  source_uid        text NOT NULL,
  source_url        text,
  title             text NOT NULL,
  description       text,
  starts_at_utc     timestamptz NOT NULL,
  ends_at_utc       timestamptz,
  tzid              text NOT NULL DEFAULT 'America/New_York',
  all_day           boolean NOT NULL DEFAULT false,
  venue_name        text,
  address           text,
  lat               numeric(9,6),
  lng               numeric(9,6),
  geocoded_at       timestamptz,
  municipality      text NOT NULL,
  category          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingested_events_source_unique UNIQUE (source_domain, source_uid)
);

CREATE INDEX IF NOT EXISTS ingested_events_starts_at_idx ON ingested_events (starts_at_utc);
CREATE INDEX IF NOT EXISTS ingested_events_municipality_idx ON ingested_events (municipality);
-- Plain lat/lng btree (radius math is done app-side; earthdistance gist is
-- optional polish and Supabase needs cube+earthdistance enabled separately).
CREATE INDEX IF NOT EXISTS ingested_events_latlng_idx ON ingested_events (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Per spec "Honest notes": log unparseable locations for review, never drop the event
CREATE TABLE IF NOT EXISTS unparseable_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_domain text NOT NULL,
  source_uid    text NOT NULL,
  raw_location  text NOT NULL,
  seen_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unparseable_locations_unique UNIQUE (source_domain, source_uid)
);

-- Venue geocode cache keyed on normalized address — saves ~80% of geocode calls
-- (city hall, library branches, parks repeat constantly across events)
CREATE TABLE IF NOT EXISTS venue_geocache (
  norm_address  text PRIMARY KEY,
  lat           numeric(9,6) NOT NULL,
  lng           numeric(9,6) NOT NULL,
  source        text NOT NULL DEFAULT 'google',
  cached_at     timestamptz NOT NULL DEFAULT now()
);
