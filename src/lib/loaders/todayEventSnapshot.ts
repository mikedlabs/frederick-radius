import "server-only";

import { getSql } from "@/lib/db/client";
import { archivedEventFromSnapshot } from "@/lib/events/event-identity";
import { isPublicEvent } from "@/lib/events/classify";
import { applyEventNotices } from "@/lib/events/notices";
import {
  allUpcoming,
  type EventWithMeta,
} from "@/lib/loaders/events";
import type { UnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";

type CancellablePromiseLike<T> = PromiseLike<T> & {
  cancel?: () => void;
};

type ArchiveCandidate = {
  canonical_slug: string;
  snapshot: unknown;
};

type ArchiveEnvelope = {
  candidates: unknown;
  archive_status: string | null;
  archive_finished_at: string | Date | null;
  archive_records_failed: number | string | null;
};

// 650ms lost the race on every cold start: a fresh Supavisor connection takes
// 300-800ms of TLS + auth before the query even runs, so the first request an
// instance served always fell back to the ~10 curated seeds while 900+ real
// events sat readable in the archive (events-outage diagnosis, 2026-08-18).
// One second keeps the briefing budget honest while letting a cold connection
// finish; warm reads still answer in tens of milliseconds.
export const TODAY_EVENT_SNAPSHOT_TIMEOUT_MS = 1_000;
export const TODAY_EVENT_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 60 * 1_000;
const TODAY_EVENT_HORIZON_DAYS = 9;
const TODAY_EVENT_SNAPSHOT_LIMIT = 1_000;
// Discovery can tolerate a slightly longer first read than Today's briefing.
// The archive query itself is fast, but a cold serverless connection can take
// more than 700 ms to reach Supabase. Giving the connection the full bounded
// read budget prevents the Events board from collapsing to the small curated
// build fallback even while the archive and its heartbeat are healthy.
export const EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS = 2_500;
export const EVENT_BROWSE_HORIZON_DAYS = 90;
export const EVENT_BROWSE_SNAPSHOT_LIMIT = 1_500;

type EventArchiveSnapshotOptions = {
  horizonDays?: number;
  limit?: number;
  timeoutMs?: number;
};

function snapshotBounds(
  now: Date,
  horizonDays: number,
): { start: Date; end: Date } {
  const today = easternParts(now);
  const horizon = easternParts(
    new Date(
      Date.UTC(
        today.year,
        today.month - 1,
        today.day + horizonDays,
        12,
      ),
    ),
  );
  return {
    start: new Date(
      easternWallToUtcISO(today.year, today.month, today.day, 0, 0),
    ),
    end: new Date(
      easternWallToUtcISO(
        horizon.year,
        horizon.month,
        horizon.day,
        0,
        0,
      ),
    ),
  };
}

async function beforeDeadline<T>(
  pending: CancellablePromiseLike<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = Promise.resolve(pending).then(
    (value) => ({ status: "ok" as const, value }),
    () => ({ status: "failed" as const }),
  );
  const stopped = new Promise<{ status: "timeout" }>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "timeout" }),
      timeoutMs,
    );
  });
  try {
    const result = await Promise.race([guarded, stopped]);
    if (result.status !== "ok") {
      try {
        pending.cancel?.();
      } catch {
        // Cancellation is best-effort; the guarded promise consumes a late rejection.
      }
      return null;
    }
    return result.value;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function curatedFallback(now: Date, reason: string): UnifiedEvents {
  const unified = applyEventNotices(allUpcoming(now), now);
  return {
    unified,
    publicEvents: unified.filter(isPublicEvent),
    sourceHealth: {
      degraded: true,
      // Name WHICH failure produced the fallback. All three paths (no
      // database, read timeout, unusable archive) used to emit the same
      // "event archive" string, which made the production outage — cold
      // reads timing out while the archive itself was healthy — invisible
      // in every health surface (events-outage diagnosis, 2026-08-18).
      unavailable: [`event archive (${reason})`],
    },
  };
}

function candidateRows(value: unknown): ArchiveCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    return typeof row.canonical_slug === "string"
      ? [{ canonical_slug: row.canonical_slug, snapshot: row.snapshot }]
      : [];
  });
}

export function hydrateTodayEventSnapshot(
  envelope: ArchiveEnvelope,
  now: Date,
): UnifiedEvents {
  const curated = allUpcoming(now);
  const bySlug = new Map<string, EventWithMeta>(
    curated.map((event) => [event.slug, event]),
  );
  let invalidSnapshots = 0;
  for (const row of candidateRows(envelope.candidates)) {
    const event = archivedEventFromSnapshot(
      row.snapshot,
      row.canonical_slug,
    );
    if (!event) {
      invalidSnapshots += 1;
      continue;
    }
    if (!bySlug.has(event.slug)) bySlug.set(event.slug, event);
  }

  const finishedAt = envelope.archive_finished_at
    ? new Date(envelope.archive_finished_at).getTime()
    : Number.NaN;
  const unavailable: string[] = [];
  // The old gate rejected the archive whenever the last run was not "ok" or
  // ANY record failed — but the collector aggregates ~28 upstream sources and
  // marks itself "partial" if one of them hiccuped, which is the steady
  // state: 830 consecutive runs, never once "ok". So a fresh archive holding
  // 900+ real events was flagged unusable over 1 failed record, and readers
  // treated ten curated seeds as the better answer. The reader's question is
  // narrower than the collector's: was the archive WRITTEN successfully, and
  // recently? Collection gaps are upstream news, already carried per-source
  // by feed health; the rows that made it into the archive are real either
  // way (events-outage diagnosis, 2026-08-18).
  if (envelope.archive_status == null || envelope.archive_status === "error") {
    unavailable.push("event archive (last run failed)");
  } else if (
    !Number.isFinite(finishedAt) ||
    now.getTime() - finishedAt > TODAY_EVENT_SNAPSHOT_MAX_AGE_MS ||
    now.getTime() < finishedAt - 5 * 60_000
  ) {
    unavailable.push("event archive (stale)");
  }
  if (invalidSnapshots > 0) unavailable.push("event archive validation");

  const unified = applyEventNotices(
    [...bySlug.values()].sort(
      (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
    ),
    now,
  );
  return {
    unified,
    publicEvents: unified.filter(isPublicEvent),
    sourceHealth: {
      degraded: unavailable.length > 0,
      unavailable,
    },
  };
}

/**
 * Bounded, durable event read for the Today briefing.
 *
 * The two-hour archive job owns the expensive live-feed fan-out. A visitor
 * reads that last-known-good snapshot through one cancellable database query;
 * a missing, slow, partial, or stale archive keeps curated rows and exposes an
 * honest degraded signal. This deliberately never calls a live provider.
 */
export async function loadTodayEventSnapshot(
  now = new Date(),
): Promise<UnifiedEvents> {
  return loadEventArchiveSnapshot(now, {
    horizonDays: TODAY_EVENT_HORIZON_DAYS,
    limit: TODAY_EVENT_SNAPSHOT_LIMIT,
    timeoutMs: TODAY_EVENT_SNAPSHOT_TIMEOUT_MS,
  });
}

/**
 * Bounded durable read for discovery surfaces that need a wider horizon.
 *
 * A visitor reads the archive written by the background source worker. This
 * function never contacts a publisher, geocoder, or ticketing provider. The
 * limits are clamped so a malformed caller cannot turn one page view into an
 * unbounded database response.
 */
export async function loadEventArchiveSnapshot(
  now = new Date(),
  options: EventArchiveSnapshotOptions = {},
): Promise<UnifiedEvents> {
  const horizonDays = Math.max(
    1,
    Math.min(120, Math.floor(options.horizonDays ?? EVENT_BROWSE_HORIZON_DAYS)),
  );
  const limit = Math.max(
    1,
    Math.min(2_000, Math.floor(options.limit ?? EVENT_BROWSE_SNAPSHOT_LIMIT)),
  );
  const timeoutMs = Math.max(
    100,
    Math.min(1_500, Math.floor(options.timeoutMs ?? EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS)),
  );
  const sql = getSql();
  if (!sql) return curatedFallback(now, "no database");
  const { start, end } = snapshotBounds(now, horizonDays);
  const pending = sql<ArchiveEnvelope[]>`
    with latest_archive as (
      select status,
             coalesce(ended_at, started_at) as finished_at,
             records_failed
      from public.ingest_runs
      where source_slug = 'event-archive'
      order by started_at desc
      limit 1
    ),
    candidates as (
      select canonical.id,
             canonical.canonical_slug,
             canonical.snapshot,
             canonical.starts_at
      from public.event_canonical_records as canonical
      left join public.event_tombstones as tombstone
        on tombstone.canonical_event_id = canonical.id
      where canonical.event_status = 'scheduled'
        and tombstone.canonical_event_id is null
        and canonical.starts_at < ${end}
        and coalesce(canonical.ends_at, canonical.starts_at) >= ${start}
      order by canonical.starts_at asc, canonical.id
      limit ${limit}
    )
    select coalesce(
             (
               select jsonb_agg(
                 jsonb_build_object(
                   'canonical_slug', canonical_slug,
                   'snapshot', snapshot
                 )
                 order by starts_at, id
               )
               from candidates
             ),
             '[]'::jsonb
           ) as candidates,
           latest_archive.status as archive_status,
           latest_archive.finished_at as archive_finished_at,
           latest_archive.records_failed as archive_records_failed
    from (values (1)) as anchor(value)
    left join latest_archive on true
  `;
  const rows = await beforeDeadline(
    pending,
    timeoutMs,
  );
  const envelope = rows?.[0];
  // A null row set here means beforeDeadline gave up, not that the archive
  // is empty: the query always returns one anchor row when it completes.
  return envelope ? hydrateTodayEventSnapshot(envelope, now) : curatedFallback(now, "read timeout");
}
