import "server-only";
import type { Sql } from "postgres";

export type EventSchemaSurface = "civic-ingest" | "event-archive";

export type EventSchemaReadiness =
  | {
      ready: true;
      missing: [];
    }
  | {
      ready: false;
      missing: string[];
    };

export type SchemaRequirement = {
  table: string;
  column: string;
};

const CIVIC_INGEST_REQUIREMENTS: readonly SchemaRequirement[] = [
  { table: "ingest_runs", column: "id" },
  { table: "ingest_runs", column: "source_slug" },
  { table: "ingest_runs", column: "started_at" },
  { table: "ingest_runs", column: "ended_at" },
  { table: "ingest_runs", column: "status" },
  { table: "ingest_runs", column: "records_in" },
  { table: "ingest_runs", column: "records_upserted" },
  { table: "ingest_runs", column: "records_failed" },
  { table: "ingest_runs", column: "error" },
  { table: "raw_events", column: "id" },
  { table: "raw_events", column: "source_domain" },
  { table: "raw_events", column: "source_uid" },
  { table: "raw_events", column: "source_url" },
  { table: "raw_events", column: "raw_vevent" },
  { table: "raw_events", column: "dtstamp" },
  { table: "raw_events", column: "fetched_at" },
  { table: "ingested_events", column: "id" },
  { table: "ingested_events", column: "raw_event_id" },
  { table: "ingested_events", column: "source_domain" },
  { table: "ingested_events", column: "source_uid" },
  { table: "ingested_events", column: "source_url" },
  { table: "ingested_events", column: "title" },
  { table: "ingested_events", column: "description" },
  { table: "ingested_events", column: "starts_at_utc" },
  { table: "ingested_events", column: "ends_at_utc" },
  { table: "ingested_events", column: "tzid" },
  { table: "ingested_events", column: "all_day" },
  { table: "ingested_events", column: "venue_name" },
  { table: "ingested_events", column: "address" },
  { table: "ingested_events", column: "lat" },
  { table: "ingested_events", column: "lng" },
  { table: "ingested_events", column: "geocoded_at" },
  { table: "ingested_events", column: "municipality" },
  { table: "ingested_events", column: "category" },
  // Migration 0035. Checking this once prevents a missing deployment
  // migration from becoming thousands of identical row failures.
  { table: "ingested_events", column: "hero_image" },
  { table: "ingested_events", column: "hero_image_alt" },
  { table: "ingested_events", column: "updated_at" },
  { table: "unparseable_locations", column: "source_domain" },
  { table: "unparseable_locations", column: "source_uid" },
  { table: "unparseable_locations", column: "raw_location" },
  { table: "unparseable_locations", column: "seen_at" },
] as const;

export const EVENT_ARCHIVE_REQUIREMENTS: readonly SchemaRequirement[] = [
  { table: "ingest_runs", column: "id" },
  { table: "event_canonical_records", column: "id" },
  { table: "event_canonical_records", column: "canonical_slug" },
  { table: "event_canonical_records", column: "snapshot" },
  { table: "event_canonical_records", column: "starts_at" },
  { table: "event_canonical_records", column: "ends_at" },
  { table: "event_canonical_records", column: "event_status" },
  { table: "event_canonical_records", column: "source_url" },
  { table: "event_canonical_records", column: "first_seen_at" },
  { table: "event_canonical_records", column: "last_seen_at" },
  { table: "event_canonical_records", column: "snapshot_at" },
  { table: "event_canonical_records", column: "updated_at" },
  { table: "event_source_identities", column: "source" },
  { table: "event_source_identities", column: "source_uid" },
  { table: "event_source_identities", column: "canonical_event_id" },
  { table: "event_source_identities", column: "last_seen_at" },
  { table: "event_slug_aliases", column: "slug" },
  { table: "event_slug_aliases", column: "canonical_event_id" },
  { table: "event_slug_aliases", column: "last_seen_at" },
  { table: "event_tombstones", column: "canonical_event_id" },
  { table: "event_tombstones", column: "last_snapshot" },
  { table: "event_tombstones", column: "reason" },
  { table: "event_tombstones", column: "tombstoned_at" },
  { table: "event_tombstones", column: "source_last_seen_at" },
] as const;

function requirementsFor(
  surface: EventSchemaSurface,
): readonly SchemaRequirement[] {
  return surface === "civic-ingest"
    ? CIVIC_INGEST_REQUIREMENTS
    : EVENT_ARCHIVE_REQUIREMENTS;
}

/**
 * Verify the exact tables and columns a scheduled event writer is about to
 * use. This is intentionally one cheap catalog query before any upstream
 * fetch or row loop, so an unapplied migration fails once with an actionable
 * list instead of failing every event independently.
 */
export async function checkEventSchemaReadiness(
  sql: Sql,
  surface: EventSchemaSurface,
): Promise<EventSchemaReadiness> {
  const requirements = requirementsFor(surface);
  const tables = requirements.map((requirement) => requirement.table);
  const columns = requirements.map((requirement) => requirement.column);
  const rows = await sql<{ table_name: string; column_name: string }[]>`
    WITH required AS (
      SELECT requirement.table_name, requirement.column_name
      FROM unnest(
        ${tables}::text[],
        ${columns}::text[]
      ) AS requirement(table_name, column_name)
    )
    SELECT required.table_name, required.column_name
    FROM required
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS available
      WHERE available.table_schema = 'public'
        AND available.table_name = required.table_name
        AND available.column_name = required.column_name
    )
    ORDER BY required.table_name, required.column_name
  `;
  const missing = rows.map(
    (row) => `${row.table_name}.${row.column_name}`,
  );
  return missing.length === 0
    ? { ready: true, missing: [] }
    : { ready: false, missing };
}
