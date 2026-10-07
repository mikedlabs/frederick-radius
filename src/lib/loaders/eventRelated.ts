import "server-only";
import { getSql } from "@/lib/db/client";
import {
  allUpcoming,
  seriesKey,
  type EventWithMeta,
} from "@/lib/loaders/events";
import { archivedEventFromSnapshot } from "@/lib/events/event-identity";
import { isPublicEvent } from "@/lib/events/classify";
import { compareForLead } from "@/lib/events/lead-rank";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { haversineMeters } from "@/lib/geo";

type SnapshotRow = {
  canonical_slug: string;
  snapshot: unknown;
};

type CancellablePromiseLike<T> = PromiseLike<T> & {
  cancel?: () => void;
};

export type RelatedEventSection = {
  kind: "venue" | "nearby" | "weekend";
  title: string;
  items: EventWithMeta[];
};

export type RelatedEventSections = {
  lineup: EventWithMeta[];
  /** At most two shelves: "More at <venue>", then "Same night nearby" or,
   *  when nothing nearby qualifies, the event's weekend. Never the county's
   *  soonest rows, which ended every page with the same walking group. */
  sections: RelatedEventSection[];
};

export const RELATED_EVENT_TIMEOUT_MS = 550;
/** Rows shown per shelf. */
export const RELATED_SECTION_LIMIT = 3;
/** "Same night": a start within this many hours of the event's start. */
export const SAME_NIGHT_WINDOW_MS = 3 * 3_600_000;
/** "Nearby": a straight-line walk of about a mile between precise pins. */
export const SAME_NIGHT_RADIUS_M = 1_500;
const VENUE_QUERY_LIMIT = 40;
const WINDOW_QUERY_LIMIT = 80;

async function beforeDeadline<T>(
  pending: CancellablePromiseLike<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = Promise.resolve(pending).then(
    (value) => ({ status: "ok" as const, value }),
    () => ({ status: "failed" as const }),
  );
  const timed = new Promise<{ status: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  try {
    const outcome = await Promise.race([guarded, timed]);
    if (outcome.status === "timeout") {
      try {
        pending.cancel?.();
      } catch {
        // Cancellation is best-effort.
      }
      return null;
    }
    return outcome.status === "ok" ? outcome.value : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasPrecisePin(e: Pick<EventWithMeta, "geo_confidence">): boolean {
  return e.geo_confidence === "venue_match" || e.geo_confidence === "exact_address";
}

/**
 * The Fri 5 PM to Mon 00:00 Eastern window an event belongs to: the weekend
 * it falls in, or the next one for a weekday event. A past event anchors on
 * now so the shelf still offers something the reader can attend.
 */
export function relatedWeekendWindow(
  event: Pick<EventWithMeta, "starts_at">,
  now: Date,
): { startMs: number; endMs: number; isCurrent: boolean } {
  const startMs = Date.parse(event.starts_at);
  const anchor = new Date(
    Number.isFinite(startMs) ? Math.max(startMs, now.getTime()) : now.getTime(),
  );
  const bounds = buildHorizonBounds(anchor);
  const current = buildHorizonBounds(now);
  return {
    startMs: bounds.weekendStart,
    endMs: bounds.weekendEnd,
    isCurrent: bounds.weekendStart === current.weekendStart,
  };
}

function weekendTitle(window: { startMs: number; isCurrent: boolean }): string {
  if (window.isCurrent) return "Also this weekend";
  const friday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
  }).format(new Date(window.startMs));
  return `Also the weekend of ${friday}`;
}

/** Chronological reading order for a short shelf. */
function byStart(a: EventWithMeta, b: EventWithMeta): number {
  return Date.parse(a.starts_at) - Date.parse(b.starts_at);
}

async function archivedRows(
  read: (sql: NonNullable<ReturnType<typeof getSql>>) => CancellablePromiseLike<SnapshotRow[]>,
): Promise<EventWithMeta[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await beforeDeadline(read(sql), RELATED_EVENT_TIMEOUT_MS);
  if (!rows) return [];
  return rows.flatMap((row) => {
    const event = archivedEventFromSnapshot(row.snapshot, row.canonical_slug);
    return event ? [event] : [];
  });
}

/**
 * Three bounded reads replace the old "30 soonest countywide" query: the
 * event's own venue (which also carries its recurring lineup), the hours
 * around its start, and its weekend. Each read has the same deadline and
 * degrades to an empty list on its own.
 */
async function archivedCandidates(
  event: EventWithMeta,
  now: Date,
): Promise<EventWithMeta[]> {
  const horizon = new Date(now.getTime() + 180 * 86_400_000);
  // ISO text, not Date. Same driver serialisation failure as
  // todayEventSnapshot.ts: under the pooler's `prepare: false` postgres-js
  // cannot infer the parameter type and hands a Date to the string writer.
  const nowIso = now.toISOString();
  const horizonIso = horizon.toISOString();
  // Empty values become SQL NULL so they can never match every unnamed row.
  const venueSlug = event.venue_place_slug?.trim() || null;
  const venueName = (event.venue_name ?? "").trim().toLowerCase() || null;
  const startMs = Date.parse(event.starts_at);
  const weekend = relatedWeekendWindow(event, now);

  // The venue read also feeds the recurring lineup, whose series key is the
  // venue name, so it matches by name as well as by resolved place.
  const venue = venueSlug || venueName
    ? archivedRows((sql) => sql<SnapshotRow[]>`
        select canonical.canonical_slug, canonical.snapshot
        from public.event_canonical_records as canonical
        left join public.event_tombstones as tombstone
          on tombstone.canonical_event_id = canonical.id
        where canonical.starts_at > ${nowIso}::timestamptz
          and canonical.starts_at <= ${horizonIso}::timestamptz
          and canonical.event_status = 'scheduled'
          and tombstone.canonical_event_id is null
          and (
            canonical.snapshot->>'venue_place_slug' = ${venueSlug}::text
            or lower(canonical.snapshot->>'venue_name') = ${venueName}::text
          )
        order by canonical.starts_at asc, canonical.id
        limit ${VENUE_QUERY_LIMIT}
      `)
    : Promise.resolve([]);

  const sameNight = Number.isFinite(startMs) && hasPrecisePin(event)
    ? archivedRows((sql) => sql<SnapshotRow[]>`
        select canonical.canonical_slug, canonical.snapshot
        from public.event_canonical_records as canonical
        left join public.event_tombstones as tombstone
          on tombstone.canonical_event_id = canonical.id
        where canonical.starts_at > ${nowIso}::timestamptz
          and canonical.starts_at >= ${new Date(startMs - SAME_NIGHT_WINDOW_MS).toISOString()}::timestamptz
          and canonical.starts_at <= ${new Date(startMs + SAME_NIGHT_WINDOW_MS).toISOString()}::timestamptz
          and canonical.event_status = 'scheduled'
          and tombstone.canonical_event_id is null
        order by canonical.starts_at asc, canonical.id
        limit ${WINDOW_QUERY_LIMIT}
      `)
    : Promise.resolve([]);

  const weekendRows = archivedRows((sql) => sql<SnapshotRow[]>`
    select canonical.canonical_slug, canonical.snapshot
    from public.event_canonical_records as canonical
    left join public.event_tombstones as tombstone
      on tombstone.canonical_event_id = canonical.id
    where canonical.starts_at > ${nowIso}::timestamptz
      and canonical.starts_at >= ${new Date(weekend.startMs).toISOString()}::timestamptz
      and canonical.starts_at < ${new Date(weekend.endMs).toISOString()}::timestamptz
      and canonical.event_status = 'scheduled'
      and tombstone.canonical_event_id is null
    order by canonical.starts_at asc, canonical.id
    limit ${WINDOW_QUERY_LIMIT}
  `);

  const groups = await Promise.all([venue, sameNight, weekendRows]);
  return groups.flat();
}

export function buildRelatedEventSections(
  event: EventWithMeta,
  now: Date,
  archived: readonly EventWithMeta[],
): RelatedEventSections {
  const bySlug = new Map<string, EventWithMeta>();
  for (const candidate of [...archived, ...allUpcoming(now)]) {
    if (!bySlug.has(candidate.slug)) bySlug.set(candidate.slug, candidate);
  }
  const pool = [...bySlug.values()];
  const currentSeries = seriesKey(event);
  const lineup = event.is_recurring
    ? pool
        .filter(
          (candidate) =>
            candidate.slug !== event.slug &&
            seriesKey(candidate) === currentSeries,
        )
        .sort(byStart)
        .slice(0, 30)
    : [];

  // Shelves offer other things a person can attend: public lane only, still
  // ahead of the reader, and never another date of this same series (the
  // lineup already lists those).
  const upcoming = pool
    .filter(
      (candidate) =>
        candidate.slug !== event.slug &&
        seriesKey(candidate) !== currentSeries &&
        Date.parse(candidate.starts_at) > now.getTime() &&
        isPublicEvent(candidate),
    )
    .sort(byStart);

  const sections: RelatedEventSection[] = [];
  const venueSlug = event.venue_place_slug ?? null;
  const venueName = (event.venue_name ?? "").trim();
  const atVenue = (candidate: EventWithMeta) =>
    venueSlug !== null && candidate.venue_place_slug === venueSlug;

  if (venueSlug && venueName) {
    const items = upcoming.filter(atVenue).slice(0, RELATED_SECTION_LIMIT);
    if (items.length > 0) {
      sections.push({ kind: "venue", title: `More at ${venueName}`, items });
    }
  }

  const elsewhere = upcoming.filter((candidate) => !atVenue(candidate));
  const startMs = Date.parse(event.starts_at);
  const nearby =
    Number.isFinite(startMs) && hasPrecisePin(event)
      ? elsewhere
          .filter(
            (candidate) =>
              hasPrecisePin(candidate) &&
              Math.abs(Date.parse(candidate.starts_at) - startMs) <=
                SAME_NIGHT_WINDOW_MS,
          )
          .map((candidate) => ({
            candidate,
            distance: haversineMeters(event.geom, candidate.geom),
          }))
          .filter(({ distance }) => distance <= SAME_NIGHT_RADIUS_M)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, RELATED_SECTION_LIMIT)
          .map(({ candidate }) => candidate)
          .sort(byStart)
      : [];

  if (nearby.length > 0) {
    sections.push({ kind: "nearby", title: "Same night nearby", items: nearby });
  } else {
    const weekend = relatedWeekendWindow(event, now);
    // Lead order picks the weekend's draws over its standing programs; the
    // chosen few then read in time order.
    const items = elsewhere
      .filter((candidate) => {
        const start = Date.parse(candidate.starts_at);
        return start >= weekend.startMs && start < weekend.endMs;
      })
      .sort((a, b) => compareForLead(a, b))
      .slice(0, RELATED_SECTION_LIMIT)
      .sort(byStart);
    if (items.length > 0) {
      sections.push({ kind: "weekend", title: weekendTitle(weekend), items });
    }
  }

  return { lineup, sections };
}

export async function loadRelatedEventSections(
  event: EventWithMeta,
  now = new Date(),
): Promise<RelatedEventSections> {
  const archived = await archivedCandidates(event, now);
  return buildRelatedEventSections(event, now, archived);
}
