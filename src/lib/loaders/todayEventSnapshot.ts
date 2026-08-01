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

export const TODAY_EVENT_SNAPSHOT_TIMEOUT_MS = 650;
export const TODAY_EVENT_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 60 * 1_000;
const TODAY_EVENT_HORIZON_DAYS = 9;
const TODAY_EVENT_SNAPSHOT_LIMIT = 1_000;

function snapshotBounds(now: Date): { start: Date; end: Date } {
  const today = easternParts(now);
  const horizon = easternParts(
    new Date(
      Date.UTC(
        today.year,
        today.month - 1,
        today.day + TODAY_EVENT_HORIZON_DAYS,
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

function curatedFallback(now: Date): UnifiedEvents {
  const unified = applyEventNotices(allUpcoming(now), now);
  return {
    unified,
    publicEvents: unified.filter(isPublicEvent),
    sourceHealth: {
      degraded: true,
      unavailable: ["event archive"],
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
  const recordsFailed = Number(envelope.archive_records_failed ?? 0);
  const unavailable: string[] = [];
  if (
    envelope.archive_status !== "ok" ||
    !Number.isFinite(finishedAt) ||
    now.getTime() - finishedAt > TODAY_EVENT_SNAPSHOT_MAX_AGE_MS ||
    now.getTime() < finishedAt - 5 * 60_000 ||
    !Number.isFinite(recordsFailed) ||
    recordsFailed > 0
  ) {
    unavailable.push("event archive");
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
  const sql = getSql();
  if (!sql) return curatedFallback(now);
  const { start, end } = snapshotBounds(now);
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
      limit ${TODAY_EVENT_SNAPSHOT_LIMIT}
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
    TODAY_EVENT_SNAPSHOT_TIMEOUT_MS,
  );
  const envelope = rows?.[0];
  return envelope ? hydrateTodayEventSnapshot(envelope, now) : curatedFallback(now);
}
