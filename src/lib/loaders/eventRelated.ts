import "server-only";
import { getSql } from "@/lib/db/client";
import {
  allUpcoming,
  seriesKey,
  type EventWithMeta,
} from "@/lib/loaders/events";
import { archivedEventFromSnapshot } from "@/lib/events/event-identity";
import { isPublicEvent } from "@/lib/events/classify";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

type SnapshotRow = {
  canonical_slug: string;
  snapshot: unknown;
};

type CancellablePromiseLike<T> = PromiseLike<T> & {
  cancel?: () => void;
};

export type RelatedEventSections = {
  lineup: EventWithMeta[];
  moreUpcoming: {
    title: string;
    items: EventWithMeta[];
  };
};

export const RELATED_EVENT_TIMEOUT_MS = 550;
const RELATED_QUERY_LIMIT = 30;

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

/** The event's own town and venue, used to narrow the second archive read. */
type LocalScope = { municipality: string; venuePlaceSlug: string };

async function archivedUpcoming(
  now: Date,
  local: LocalScope | null = null,
): Promise<EventWithMeta[]> {
  const sql = getSql();
  if (!sql) return [];
  const horizon = new Date(now.getTime() + 180 * 86_400_000);
  // ISO text, not Date. Same driver serialisation failure as
  // todayEventSnapshot.ts: under the pooler's `prepare: false` postgres-js
  // cannot infer the parameter type and hands a Date to the string writer.
  // This query had the identical bug and would have kept failing silently
  // after the other was fixed.
  //
  // With `local`, the read keeps only the event's own town or venue. The
  // county-wide read returns the next 30 events, nearly all of them in
  // Frederick City, so an Emmitsburg page offered only Frederick events as
  // "more upcoming" (November 11, 2026 hierarchy audit).
  const pending = local
    ? sql<SnapshotRow[]>`
    select canonical.canonical_slug, canonical.snapshot
    from public.event_canonical_records as canonical
    left join public.event_tombstones as tombstone
      on tombstone.canonical_event_id = canonical.id
    where canonical.starts_at > ${now.toISOString()}::timestamptz
      and canonical.starts_at <= ${horizon.toISOString()}::timestamptz
      and canonical.event_status = 'scheduled'
      and tombstone.canonical_event_id is null
      and (
        canonical.snapshot->>'municipality' = ${local.municipality}
        or canonical.snapshot->>'venue_place_slug' = ${local.venuePlaceSlug}
      )
    order by canonical.starts_at asc, canonical.id
    limit ${RELATED_QUERY_LIMIT}
  `
    : sql<SnapshotRow[]>`
    select canonical.canonical_slug, canonical.snapshot
    from public.event_canonical_records as canonical
    left join public.event_tombstones as tombstone
      on tombstone.canonical_event_id = canonical.id
    where canonical.starts_at > ${now.toISOString()}::timestamptz
      and canonical.starts_at <= ${horizon.toISOString()}::timestamptz
      and canonical.event_status = 'scheduled'
      and tombstone.canonical_event_id is null
    order by canonical.starts_at asc, canonical.id
    limit ${RELATED_QUERY_LIMIT}
  `;
  const rows = await beforeDeadline(pending, RELATED_EVENT_TIMEOUT_MS);
  if (!rows) return [];
  return rows.flatMap((row) => {
    const event = archivedEventFromSnapshot(
      row.snapshot,
      row.canonical_slug,
    );
    return event ? [event] : [];
  });
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
        .sort(
          (a, b) =>
            Date.parse(a.starts_at) - Date.parse(b.starts_at),
        )
        .slice(0, 30)
    : [];

  // Only events that public discovery would list. A closure notice or a
  // board meeting is never offered as something else to do.
  const upcoming = pool
    .filter(
      (candidate) =>
        candidate.slug !== event.slug &&
        seriesKey(candidate) !== currentSeries &&
        Date.parse(candidate.starts_at) > now.getTime() &&
        isPublicEvent(candidate),
    )
    .sort(
      (a, b) =>
        Date.parse(a.starts_at) - Date.parse(b.starts_at),
    );
  const venueName = (event.venue_name ?? "").trim();
  const venueKey =
    event.venue_place_slug ??
    (venueName ? venueName.toLowerCase() : null);
  const sameVenue = venueKey
    ? upcoming
        .filter((candidate) => {
          const key =
            candidate.venue_place_slug ??
            candidate.venue_name.toLowerCase();
          return key === venueKey;
        })
        .slice(0, 4)
    : [];
  // Same venue first, then the same town. Rows from another town follow the
  // local ones, and each row already prints its town on the location line.
  const town = event.municipality;
  const townName =
    (town && MUNICIPALITY_BY_SLUG[town]?.name) ||
    event.municipality_name?.trim() ||
    "";
  const sameTown = town
    ? upcoming.filter((candidate) => candidate.municipality === town)
    : [];
  const elsewhere = town
    ? upcoming.filter((candidate) => candidate.municipality !== town)
    : upcoming;
  let moreUpcoming: RelatedEventSections["moreUpcoming"];
  if (sameVenue.length >= 2 && venueName) {
    moreUpcoming = { title: `More at ${venueName}`, items: sameVenue };
  } else if (sameTown.length >= 2 && townName) {
    moreUpcoming = { title: `More in ${townName}`, items: sameTown.slice(0, 6) };
  } else if (sameTown.length === 0 && townName) {
    moreUpcoming = { title: "Elsewhere in Frederick County", items: elsewhere.slice(0, 6) };
  } else {
    moreUpcoming = {
      title: "More upcoming events",
      items: [...sameTown, ...elsewhere].slice(0, 6),
    };
  }
  return { lineup, moreUpcoming };
}

export async function loadRelatedEventSections(
  event: EventWithMeta,
  now = new Date(),
): Promise<RelatedEventSections> {
  // Two bounded reads in parallel: the event's own town and venue, and the
  // next events county-wide as the fallback.
  const local: LocalScope | null = event.municipality
    ? {
        municipality: event.municipality,
        venuePlaceSlug: event.venue_place_slug ?? "",
      }
    : null;
  const [nearby, countywide] = await Promise.all([
    local ? archivedUpcoming(now, local) : Promise.resolve([]),
    archivedUpcoming(now),
  ]);
  return buildRelatedEventSections(event, now, [...nearby, ...countywide]);
}
