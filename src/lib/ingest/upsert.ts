/**
 * Idempotent staging + normalized writes. Re-running the ingester must
 * never create duplicates and only re-normalizes event content when DTSTAMP
 * advanced (category metadata may reconcile after a missing feed recovers).
 * Dedup key is (source_domain, source_uid) — never UID alone (UIDs collide
 * across municipalities).
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

type ExistingEventRow = {
  id: string;
  dtstamp: string | Date;
  normalized_id: string | null;
  category: string | null;
};

/**
 * Atomically upsert one raw + normalized event, re-normalizing content only
 * when the raw row is new/advanced while still allowing category-only healing.
 */
export async function upsertEvent(
  sql: Sql,
  opts: {
    sourceDomain: string;
    municipality: string;
    category: string | null;
    /**
     * False when one or more category feeds were unavailable. In that case a
     * changed event may refresh its content, but must not overwrite a category
     * established by a complete feed set. New rows still retain the best
     * category available and heal on the next complete run.
     */
    categoryCoverageComplete?: boolean;
  },
  e: ParsedEvent,
  stats: UpsertStats,
): Promise<void> {
  const categoryCoverageComplete = opts.categoryCoverageComplete !== false;
  const incomingStamp = new Date(e.dtstamp).getTime();

  // Daily runs are overwhelmingly unchanged. Keep that hot path to one read
  // instead of paying BEGIN/COMMIT for thousands of no-op rows. Any raw
  // insertion/advancement (or missing normalized row) is re-checked inside the
  // transaction below before it mutates state.
  const initial = await sql<ExistingEventRow[]>`
    select raw_events.id, raw_events.dtstamp,
           ingested_events.id as normalized_id, ingested_events.category
    from raw_events
    left join ingested_events
      on ingested_events.source_domain = raw_events.source_domain
     and ingested_events.source_uid = raw_events.source_uid
    where raw_events.source_domain = ${opts.sourceDomain}
      and raw_events.source_uid = ${e.uid}
    limit 1
  `;
  const initialRow = initial[0];
  const initiallyUnchanged =
    initialRow &&
    incomingStamp <= new Date(initialRow.dtstamp).getTime();
  if (initiallyUnchanged && initialRow.normalized_id) {
    if (
      !categoryCoverageComplete ||
      initialRow.category === opts.category
    ) {
      stats.rawUnchanged += 1;
      return;
    }
    const healed = await sql<{ id: string }[]>`
      update ingested_events
      set category = ${opts.category}, updated_at = now()
      where source_domain = ${opts.sourceDomain}
        and source_uid = ${e.uid}
        and category is distinct from ${opts.category}
      returning id
    `;
    if (healed.length > 0) {
      stats.rawUnchanged += 1;
      stats.normUpserted += 1;
      return;
    }
    // A concurrent writer changed/deleted the normalized row after our read.
    // Re-check under the raw-row lock below.
  }

  // Raw advancement, normalization, and the review-queue side write form one
  // event transaction. If any later statement fails, raw DTSTAMP rolls back too
  // and the same feed row remains retryable on the next run.
  const delta = await sql.begin(async (tx) => {
    const result = emptyStats();
    let existing = await tx<ExistingEventRow[]>`
      select raw_events.id, raw_events.dtstamp,
             ingested_events.id as normalized_id, ingested_events.category
      from raw_events
      left join ingested_events
        on ingested_events.source_domain = raw_events.source_domain
       and ingested_events.source_uid = raw_events.source_uid
      where raw_events.source_domain = ${opts.sourceDomain}
        and raw_events.source_uid = ${e.uid}
      limit 1
      for update of raw_events
    `;

    let rawId: string | undefined;
    let rawChanged = false;
    let normalizedId: string | null = null;
    let currentCategory: string | null = null;
    if (existing.length === 0) {
      const inserted = await tx<{ id: string }[]>`
        insert into raw_events (source_domain, source_uid, source_url, raw_vevent, dtstamp)
        values (${opts.sourceDomain}, ${e.uid}, ${e.sourceUrl ?? null}, ${e.rawVevent}, ${e.dtstamp})
        on conflict (source_domain, source_uid) do nothing
        returning id
      `;
      if (inserted.length > 0) {
        rawId = inserted[0].id;
        rawChanged = true;
        result.rawInserted += 1;
      } else {
        // A concurrent transaction inserted this UID after our initial read.
        // Lock and compare it rather than assuming our incoming row is stale.
        existing = await tx<ExistingEventRow[]>`
          select raw_events.id, raw_events.dtstamp,
                 ingested_events.id as normalized_id, ingested_events.category
          from raw_events
          left join ingested_events
            on ingested_events.source_domain = raw_events.source_domain
           and ingested_events.source_uid = raw_events.source_uid
          where raw_events.source_domain = ${opts.sourceDomain}
            and raw_events.source_uid = ${e.uid}
          limit 1
          for update of raw_events
        `;
      }
    }

    if (!rawId) {
      const current = existing[0];
      if (!current) {
        throw new Error("raw event disappeared during upsert");
      }
      rawId = current.id;
      normalizedId = current.normalized_id;
      currentCategory = current.category;
      const advanced =
        incomingStamp > new Date(current.dtstamp).getTime();
      if (advanced) {
        await tx`
          update raw_events
          set source_url = ${e.sourceUrl ?? null}, raw_vevent = ${e.rawVevent},
              dtstamp = ${e.dtstamp}, fetched_at = now()
          where id = ${rawId}
        `;
        rawChanged = true;
        result.rawUpdated += 1;
      } else {
        result.rawUnchanged += 1;
      }
    }

    let writeFullNormalizedRow = rawChanged;
    if (!writeFullNormalizedRow) {
      if (!normalizedId) {
        // Repairs rows left inconsistent by a pre-transaction failure.
        writeFullNormalizedRow = true;
      } else if (
        categoryCoverageComplete &&
        currentCategory !== opts.category
      ) {
        // Category membership can change because a previously missing category
        // feed recovered even when the VEVENT itself retained its DTSTAMP.
        await tx`
          update ingested_events
          set category = ${opts.category}, updated_at = now()
          where source_domain = ${opts.sourceDomain} and source_uid = ${e.uid}
        `;
        result.normUpserted += 1;
      }
    }

    if (writeFullNormalizedRow) {
      const loc = parseLocation(e.rawLocation);
      if (e.rawLocation && loc.unparseable) {
        await tx`
          insert into unparseable_locations (source_domain, source_uid, raw_location)
          values (${opts.sourceDomain}, ${e.uid}, ${e.rawLocation})
          on conflict (source_domain, source_uid) do update set raw_location = excluded.raw_location, seen_at = now()
        `;
        result.unparseableLocations += 1;
      }

      await tx`
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
          lat           = case
                            when ingested_events.address is distinct from excluded.address then null
                            else ingested_events.lat
                          end,
          lng           = case
                            when ingested_events.address is distinct from excluded.address then null
                            else ingested_events.lng
                          end,
          geocoded_at   = case
                            when ingested_events.address is distinct from excluded.address then null
                            else ingested_events.geocoded_at
                          end,
          address      = excluded.address,
          municipality = excluded.municipality,
          category     = case
                           when ${categoryCoverageComplete} then excluded.category
                           else ingested_events.category
                         end,
          updated_at   = now()
      `;
      result.normUpserted += 1;
    }

    return result;
  });

  // A rolled-back transaction must not make the route report committed work.
  stats.rawInserted += delta.rawInserted;
  stats.rawUpdated += delta.rawUpdated;
  stats.rawUnchanged += delta.rawUnchanged;
  stats.normUpserted += delta.normUpserted;
  stats.unparseableLocations += delta.unparseableLocations;
}
