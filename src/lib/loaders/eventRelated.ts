import "server-only";
import { getSql } from "@/lib/db/client";
import {
  allUpcoming,
  seriesKey,
  type EventWithMeta,
} from "@/lib/loaders/events";
import { archivedEventFromSnapshot } from "@/lib/events/event-identity";

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

async function archivedUpcoming(now: Date): Promise<EventWithMeta[]> {
  const sql = getSql();
  if (!sql) return [];
  const horizon = new Date(now.getTime() + 180 * 86_400_000);
  const pending = sql<SnapshotRow[]>`
    select canonical.canonical_slug, canonical.snapshot
    from public.event_canonical_records as canonical
    left join public.event_tombstones as tombstone
      on tombstone.canonical_event_id = canonical.id
    where canonical.starts_at > ${now}
      and canonical.starts_at <= ${horizon}
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

  const upcoming = pool
    .filter(
      (candidate) =>
        candidate.slug !== event.slug &&
        seriesKey(candidate) !== currentSeries &&
        Date.parse(candidate.starts_at) > now.getTime(),
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
  return {
    lineup,
    moreUpcoming:
      sameVenue.length >= 2 && venueName
        ? { title: `More at ${venueName}`, items: sameVenue }
        : { title: "More upcoming events", items: upcoming.slice(0, 6) },
  };
}

export async function loadRelatedEventSections(
  event: EventWithMeta,
  now = new Date(),
): Promise<RelatedEventSections> {
  const archived = await archivedUpcoming(now);
  return buildRelatedEventSections(event, now, archived);
}
