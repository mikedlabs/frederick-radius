/**
 * Idempotent staging + normalized writes. Re-running the ingester must
 * never create duplicates and must only update rows whose DTSTAMP advanced
 * (spec non-negotiable #5). Dedup key is (source_domain, source_uid) —
 * never UID alone (UIDs collide across municipalities).
 */
import type { Sql } from "postgres";
import type { ParsedEvent } from "./parser";
import { parseLocation } from "./location";

export type UpsertStats = {
  rawInserted: number;
  rawUpdated: number;
  rawUnchanged: number;
  normUpserted: number;
  unparseableLocations: number;
};

export function emptyStats(): UpsertStats {
  return { rawInserted: 0, rawUpdated: 0, rawUnchanged: 0, normUpserted: 0, unparseableLocations: 0 };
}

/**
 * Upsert one event. Returns the raw_events.id and whether it changed
 * (new row or DTSTAMP advanced) so the caller can skip re-normalizing
 * unchanged events.
 */
export async function upsertEvent(
  sql: Sql,
  opts: { sourceDomain: string; municipality: string; category: string | null },
  e: ParsedEvent,
  stats: UpsertStats
): Promise<void> {
  // 1. Staging row — DTSTAMP-gated.
  const existing = await sql<{ id: string; dtstamp: string }[]>`
    select id, dtstamp from raw_events
    where source_domain = ${opts.sourceDomain} and source_uid = ${e.uid}
    limit 1
  `;

  let rawId: string;
  let changed: boolean;

  if (existing.length === 0) {
    const ins = await sql<{ id: string }[]>`
      insert into raw_events (source_domain, source_uid, source_url, raw_vevent, dtstamp)
      values (${opts.sourceDomain}, ${e.uid}, ${e.sourceUrl ?? null}, ${e.rawVevent}, ${e.dtstamp})
      on conflict (source_domain, source_uid) do nothing
      returning id
    `;
    if (ins.length > 0) {
      rawId = ins[0].id;
      changed = true;
      stats.rawInserted++;
    } else {
      // Lost a race; re-read.
      const r = await sql<{ id: string }[]>`
        select id from raw_events where source_domain = ${opts.sourceDomain} and source_uid = ${e.uid} limit 1
      `;
      rawId = r[0].id;
      changed = false;
      stats.rawUnchanged++;
    }
  } else {
    rawId = existing[0].id;
    const advanced = new Date(e.dtstamp).getTime() > new Date(existing[0].dtstamp).getTime();
    if (advanced) {
      await sql`
        update raw_events
        set source_url = ${e.sourceUrl ?? null}, raw_vevent = ${e.rawVevent},
            dtstamp = ${e.dtstamp}, fetched_at = now()
        where id = ${rawId}
      `;
      changed = true;
      stats.rawUpdated++;
    } else {
      changed = false;
      stats.rawUnchanged++;
    }
  }

  if (!changed) return; // unchanged → don't touch normalized row

  // 2. Normalize → ingested_events.
  const loc = parseLocation(e.rawLocation);
  if (e.rawLocation && loc.unparseable) {
    await sql`
      insert into unparseable_locations (source_domain, source_uid, raw_location)
      values (${opts.sourceDomain}, ${e.uid}, ${e.rawLocation})
      on conflict (source_domain, source_uid) do update set raw_location = excluded.raw_location, seen_at = now()
    `;
    stats.unparseableLocations++;
  }

  await sql`
    insert into ingested_events (
      raw_event_id, source_domain, source_uid, source_url, title, description,
      starts_at_utc, ends_at_utc, tzid, all_day, venue_name, address,
      municipality, category, updated_at
    ) values (
      ${rawId}, ${opts.sourceDomain}, ${e.uid}, ${e.sourceUrl ?? null},
      ${e.summary}, ${e.description ?? null},
      ${e.startsAtUtc}, ${e.endsAtUtc ?? null}, ${e.tzid}, ${e.allDay},
      ${loc.venueName ?? null}, ${loc.address ?? null},
      ${opts.municipality}, ${opts.category}, now()
    )
    on conflict (source_domain, source_uid) do update set
      raw_event_id = excluded.raw_event_id,
      source_url   = excluded.source_url,
      title        = excluded.title,
      description  = excluded.description,
      starts_at_utc= excluded.starts_at_utc,
      ends_at_utc  = excluded.ends_at_utc,
      tzid         = excluded.tzid,
      all_day      = excluded.all_day,
      venue_name   = excluded.venue_name,
      address      = excluded.address,
      municipality = excluded.municipality,
      category     = excluded.category,
      updated_at   = now()
  `;
  stats.normUpserted++;
}
