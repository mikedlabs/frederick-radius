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

type ArchiveReadRow = {
  canonical_slug: string | null;
  snapshot: unknown;
  archive_status: string | null;
  archive_finished_at: string | Date | null;
  archive_records_failed: number | string | null;
  archive_error: string | null;
};

type ArchiveEnvelope = {
  candidates: unknown;
  archive_status: string | null;
  archive_finished_at: string | Date | null;
  archive_records_failed: number | string | null;
  archive_error: string | null;
};

// Public archive reads include the first pooled Supabase connection on a cold
// serverless instance. The previous 650 ms budget canceled that healthy
// connection before Postgres could return the bounded nine-day snapshot. Keep
// one shared ceiling for Today and discovery: long enough for a cold connect,
// still comfortably inside the five-second primary-surface response budget.
export const EVENT_ARCHIVE_PUBLIC_READ_TIMEOUT_MS = 2_500;
export const TODAY_EVENT_SNAPSHOT_TIMEOUT_MS =
  EVENT_ARCHIVE_PUBLIC_READ_TIMEOUT_MS;
export const TODAY_EVENT_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 60 * 1_000;
const TODAY_EVENT_HORIZON_DAYS = 9;
const TODAY_EVENT_SNAPSHOT_LIMIT = 1_000;
// Lists need enough copy to explain an event, not the full detail-page body.
// Clamp before transport so the 90-day archive stays a bounded card payload.
export const EVENT_ARCHIVE_CARD_DESCRIPTION_LIMIT = 320;
// Both public event surfaces use the same bounded cold-connection budget. The
// wider discovery horizon remains bounded separately by its row and day caps.
export const EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS =
  EVENT_ARCHIVE_PUBLIC_READ_TIMEOUT_MS;
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
    (error: unknown) => {
      const code =
        error && typeof error === "object" && "code" in error &&
        typeof error.code === "string"
          ? error.code.slice(0, 80)
          : null;
      // Keep the public response fail-soft, but do not make a rejected archive
      // read invisible to operators. Query text, URLs, and thrown messages are
      // deliberately excluded because they can contain implementation or
      // credential details.
      console.warn(JSON.stringify({
        level: "warn",
        event: "event_archive_public_read_failed",
        outcome: "rejected",
        code,
      }));
      return { status: "failed" as const };
    },
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
      if (result.status === "timeout") {
        console.warn(JSON.stringify({
          level: "warn",
          event: "event_archive_public_read_failed",
          outcome: "timeout",
          timeoutMs,
        }));
      }
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
      archive: {
        state: "unavailable",
        status: null,
        finishedAt: null,
        recordsFailed: null,
        invalidSnapshots: 0,
      },
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

function archiveEnvelopeFromRows(
  rows: readonly ArchiveReadRow[],
): ArchiveEnvelope | null {
  const evidence = rows[0];
  if (!evidence) return null;
  return {
    candidates: rows.flatMap((row) =>
      typeof row.canonical_slug === "string"
        ? [{ canonical_slug: row.canonical_slug, snapshot: row.snapshot }]
        : [],
    ),
    archive_status: evidence.archive_status,
    archive_finished_at: evidence.archive_finished_at,
    archive_records_failed: evidence.archive_records_failed,
    archive_error: evidence.archive_error,
  };
}

const PROVIDER_ONLY_ARCHIVE_FAILURES = new Set([
  "unified-partial",
  "live-partial",
]);

function controlledArchiveFailures(error: string | null): string[] | null {
  if (!error || error.length > 320) return null;
  const match = /^Archive checks failed: ([a-z-]+(?:, [a-z-]+)*)\.$/.exec(error);
  return match?.[1]?.split(", ") ?? null;
}

function safeArchiveStatus(
  status: string | null,
): "ok" | "partial" | "error" | null {
  return status === "ok" || status === "partial" || status === "error"
    ? status
    : null;
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
  const status = safeArchiveStatus(envelope.archive_status);
  const controlledFailures = controlledArchiveFailures(envelope.archive_error);
  const providerOnlyPartial =
    status === "partial" &&
    Boolean(controlledFailures?.length) &&
    controlledFailures?.every((failure) =>
      PROVIDER_ONLY_ARCHIVE_FAILURES.has(failure)
    );
  const invalidFinishedAt =
    !Number.isFinite(finishedAt) || now.getTime() < finishedAt - 5 * 60_000;
  const stale =
    !invalidFinishedAt &&
    now.getTime() - finishedAt > TODAY_EVENT_SNAPSHOT_MAX_AGE_MS;
  const invalidRecordsFailed =
    !Number.isFinite(recordsFailed) || recordsFailed < 0;
  const archiveState =
    invalidSnapshots > 0 || invalidFinishedAt || invalidRecordsFailed || !status
      ? "invalid"
      : stale
        ? "stale"
        : status === "ok" && recordsFailed === 0
          ? "current"
          : providerOnlyPartial
            ? "provider_partial"
            : "failed";
  const unavailable: string[] = [];
  if (archiveState === "provider_partial") {
    unavailable.push("event archive providers");
  } else if (archiveState !== "current") {
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
      archive: {
        state: archiveState,
        status,
        finishedAt: Number.isFinite(finishedAt)
          ? new Date(finishedAt).toISOString()
          : null,
        recordsFailed: !invalidRecordsFailed ? recordsFailed : null,
        invalidSnapshots,
      },
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
    Math.min(
      EVENT_ARCHIVE_PUBLIC_READ_TIMEOUT_MS,
      Math.floor(options.timeoutMs ?? EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS),
    ),
  );
  const sql = getSql();
  if (!sql) return curatedFallback(now);
  const { start, end } = snapshotBounds(now, horizonDays);
  // Bind ISO strings rather than Date objects. The shared postgres-js client
  // can use prepared statements on direct connections, and its prepared bind
  // path rejects raw Date values before Postgres ever sees the query. Column
  // context still gives both values the correct timestamptz type.
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  // Return one row per event instead of asking Postgres to aggregate the
  // entire archive into one large JSON value. A sentinel row keeps heartbeat
  // evidence available when the requested window is genuinely empty.
  const pending = sql<ArchiveReadRow[]>`
    with latest_archive as (
      select status,
             coalesce(ended_at, started_at) as finished_at,
             records_failed,
             error
      from public.ingest_runs
      where source_slug = 'event-archive'
        and ended_at is not null
        and status in ('ok', 'partial', 'error')
      order by ended_at desc, started_at desc
      limit 1
    ),
    candidates as (
      select canonical.id,
             canonical.canonical_slug,
             case
               when jsonb_typeof(canonical.snapshot) = 'object' then
                 jsonb_set(
                   canonical.snapshot,
                   '{description}',
                   to_jsonb(
                     left(
                       coalesce(canonical.snapshot ->> 'description', ''),
                       ${EVENT_ARCHIVE_CARD_DESCRIPTION_LIMIT}
                     )
                   ),
                   true
                 )
               else canonical.snapshot
             end as snapshot,
             canonical.starts_at
      from public.event_canonical_records as canonical
      left join public.event_tombstones as tombstone
        on tombstone.canonical_event_id = canonical.id
      where canonical.event_status = 'scheduled'
        and tombstone.canonical_event_id is null
        and canonical.starts_at < ${endIso}
        and coalesce(canonical.ends_at, canonical.starts_at) >= ${startIso}
      order by canonical.starts_at asc, canonical.id
      limit ${limit}
    )
    select candidates.canonical_slug,
           candidates.snapshot,
           latest_archive.status as archive_status,
           latest_archive.finished_at as archive_finished_at,
           latest_archive.records_failed as archive_records_failed,
           latest_archive.error as archive_error
    from candidates
    left join latest_archive on true
    union all
    select null::text as canonical_slug,
           null::jsonb as snapshot,
           latest_archive.status as archive_status,
           latest_archive.finished_at as archive_finished_at,
           latest_archive.records_failed as archive_records_failed,
           latest_archive.error as archive_error
    from (values (1)) as anchor(value)
    left join latest_archive on true
    where not exists (select 1 from candidates)
  `;
  const rows = await beforeDeadline(
    pending,
    timeoutMs,
  );
  const envelope = rows ? archiveEnvelopeFromRows(rows) : null;
  return envelope ? hydrateTodayEventSnapshot(envelope, now) : curatedFallback(now);
}
