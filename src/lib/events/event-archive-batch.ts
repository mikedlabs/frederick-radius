import "server-only";
import { getSql } from "@/lib/db/client";
import type { EventWithMeta } from "@/lib/loaders/events";
import { archivedEventFromSnapshot } from "@/lib/events/event-identity";
import { archiveJsonText } from "@/lib/events/archive-json";
import {
  checkEventSchemaReadiness,
  type EventSchemaReadiness,
} from "@/lib/ingest/event-schema-readiness";

type JsonValue =
  | null
  | string
  | number
  | boolean
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

export type EventArchiveBatchRow = {
  source: string;
  source_uid: string;
  slug: string;
  snapshot: JsonValue;
  starts_at: string;
  ends_at: string | null;
  event_status: "scheduled" | "cancelled" | "postponed";
  source_url: string | null;
  verified_at: string;
};

export type EventArchiveBatchResult = {
  complete: boolean;
  /** Every accepted event row was durably processed, independent of cleanup. */
  recordsComplete: boolean;
  accepted: number;
  upserted: number;
  /**
   * Cancellation/postponement rows that had no previously published
   * canonical identity. They were processed successfully but intentionally
   * not turned into new public event records.
   */
  ignoredLifecycleOnly: number;
  tombstoned: number;
  batches: number;
  truncated: boolean;
  timedOut: boolean;
  tombstonesEnabled: boolean;
  /** Number of safe, idempotent retries after a transient database rejection. */
  retries: number;
  failure: EventArchiveBatchFailure | null;
};

export type EventArchiveBatchFailure = {
  stage: "upsert" | "tombstone";
  reason: "rejected" | "timed_out";
  /** A bounded SQLSTATE or JavaScript error name; never the raw message. */
  code: string | null;
};

type BatchWriteContext = {
  deadlineAt: number;
};

export type EventArchiveBatchWriteResult = {
  upserted: number;
  ignoredLifecycleOnly: number;
};

export type EventArchiveBatchWriter = {
  upsert(
    rows: readonly EventArchiveBatchRow[],
    context: BatchWriteContext,
  ): Promise<EventArchiveBatchWriteResult>;
  tombstoneMissing?(
    seen: readonly Pick<EventArchiveBatchRow, "source" | "source_uid">[],
    successfulSources: readonly string[],
    context: BatchWriteContext & { now: Date; graceMs: number },
  ): Promise<number>;
};

export type EventArchiveBatchOptions = {
  successfulSources?: readonly string[];
  /**
   * Complete identities observed in the successful source reads for this run.
   *
   * The cards accepted for the public board are deliberately deduplicated and
   * filtered, so they are not a safe inventory for removal checks. A live
   * publisher row can still exist upstream even when a richer duplicate wins
   * the public card. Callers that can prove a complete source read should pass
   * its raw identities here; otherwise tombstoning stays disabled.
   */
  seenSourceIdentities?: readonly {
    source: string;
    source_uid: string;
  }[];
  maxEvents?: number;
  batchSize?: number;
  deadlineMs?: number;
  graceMs?: number;
  maxTransientRetries?: number;
};

type InternalEventArchiveBatchOptions = EventArchiveBatchOptions & {
  clock?: () => number;
};

export const EVENT_ARCHIVE_BATCH_SIZE = 200;
// The production board currently carries a little over 800 upcoming rows.
// Keep a hard ceiling, but leave enough headroom for a busy seasonal calendar
// so the dedicated archive pass preserves every actionable link.
export const EVENT_ARCHIVE_MAX_EVENTS = 1_200;
export const EVENT_ARCHIVE_DEADLINE_MS = 6_000;
export const EVENT_ARCHIVE_TOMBSTONE_GRACE_MS = 36 * 60 * 60_000;
export const EVENT_ARCHIVE_MAX_TRANSIENT_RETRIES = 1;

const TRANSIENT_DATABASE_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available / lock timeout
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "53300", // too_many_connections
  "57P01",
  "57P02",
  "57P03",
]);

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

function jsonSnapshot(event: EventWithMeta): JsonValue {
  return JSON.parse(JSON.stringify(event)) as JsonValue;
}

export function prepareEventArchiveRows(
  events: readonly EventWithMeta[],
  maxEvents = EVENT_ARCHIVE_MAX_EVENTS,
): { rows: EventArchiveBatchRow[]; truncated: boolean } {
  const boundedMax = clampInteger(maxEvents, EVENT_ARCHIVE_MAX_EVENTS, 1, 1_200);
  const byIdentity = new Map<string, EventArchiveBatchRow>();
  for (const event of events) {
    if (!archivedEventFromSnapshot(event)) continue;
    const source = event.source?.trim().slice(0, 120);
    const sourceUid = event.source_id?.trim().slice(0, 1000);
    if (!source || !sourceUid) continue;
    const startsAt = new Date(event.starts_at);
    const rawEndsAt = new Date(event.ends_at);
    const endsAt =
      Number.isFinite(rawEndsAt.getTime()) && rawEndsAt >= startsAt
        ? rawEndsAt.toISOString()
        : null;
    const verifiedAt = Number.isFinite(
      Date.parse(event.last_verified_at),
    )
      ? event.last_verified_at
      : startsAt.toISOString();
    const row: EventArchiveBatchRow = {
      source,
      source_uid: sourceUid,
      slug: event.slug,
      snapshot: jsonSnapshot(event),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt,
      event_status:
        event.status === "cancelled" || event.status === "postponed"
          ? event.status
          : "scheduled",
      source_url: event.source_url ?? null,
      verified_at: verifiedAt,
    };
    const key = `${source}\u0000${sourceUid}`;
    const previous = byIdentity.get(key);
    if (
      !previous ||
      Date.parse(row.verified_at) >= Date.parse(previous.verified_at)
    ) {
      byIdentity.set(key, row);
    }
  }
  // If an unusually large upstream season ever exceeds the hard ceiling,
  // retain the events users can act on soonest instead of letting alphabetic
  // source order decide which publishers get durable links.
  const all = [...byIdentity.values()].sort(
    (a, b) =>
      Date.parse(a.starts_at) - Date.parse(b.starts_at) ||
      a.source.localeCompare(b.source) ||
      a.source_uid.localeCompare(b.source_uid),
  );
  return {
    rows: all.slice(0, boundedMax),
    truncated: all.length > boundedMax,
  };
}

const postgresWriter: EventArchiveBatchWriter = {
  async upsert(rows, context) {
    const sql = getSql();
    if (!sql || rows.length === 0 || Date.now() >= context.deadlineAt) {
      return { upserted: 0, ignoredLifecycleOnly: 0 };
    }
    return sql.begin(async (tx) => {
      const remainingMs = Math.max(100, context.deadlineAt - Date.now());
      await tx`
        select
          set_config('statement_timeout', ${`${remainingMs}ms`}, true),
          set_config('lock_timeout', '1500ms', true)
      `;
      await tx`
        create temporary table event_archive_incoming (
          source text not null,
          source_uid text not null,
          slug text not null,
          snapshot jsonb not null,
          starts_at timestamptz not null,
          ends_at timestamptz,
          event_status text not null,
          source_url text,
          verified_at timestamptz not null,
          canonical_event_id uuid,
          primary key (source, source_uid)
        ) on commit drop
      `;
      await tx`
        insert into event_archive_incoming (
          source,
          source_uid,
          slug,
          snapshot,
          starts_at,
          ends_at,
          event_status,
          source_url,
          verified_at
        )
        select
          incoming.source,
          incoming.source_uid,
          incoming.slug,
          incoming.snapshot,
          incoming.starts_at,
          incoming.ends_at,
          incoming.event_status,
          incoming.source_url,
          incoming.verified_at
        from jsonb_to_recordset(
          ${archiveJsonText(rows)}::jsonb
        ) as incoming(
          source text,
          source_uid text,
          slug text,
          snapshot jsonb,
          starts_at timestamptz,
          ends_at timestamptz,
          event_status text,
          source_url text,
          verified_at timestamptz
        )
      `;

      await tx`
        update event_archive_incoming as incoming
        set canonical_event_id = identity.canonical_event_id
        from public.event_source_identities as identity
        where identity.source = incoming.source
          and identity.source_uid = incoming.source_uid
      `;
      await tx`
        update event_archive_incoming as incoming
        set canonical_event_id = alias.canonical_event_id
        from public.event_slug_aliases as alias
        where incoming.canonical_event_id is null
          and alias.slug = incoming.slug
      `;
      await tx`
        insert into public.event_canonical_records (
          canonical_slug,
          snapshot,
          starts_at,
          ends_at,
          event_status,
          source_url,
          first_seen_at,
          last_seen_at,
          snapshot_at
        )
        select distinct on (incoming.slug)
          incoming.slug,
          incoming.snapshot,
          incoming.starts_at,
          incoming.ends_at,
          incoming.event_status,
          incoming.source_url,
          now(),
          now(),
          now()
        from event_archive_incoming as incoming
        where incoming.canonical_event_id is null
          and incoming.event_status = 'scheduled'
        order by incoming.slug, incoming.verified_at desc
        on conflict (canonical_slug) do update
          set last_seen_at = now(),
              updated_at = now()
      `;
      await tx`
        update event_archive_incoming as incoming
        set canonical_event_id = canonical.id
        from public.event_canonical_records as canonical
        where incoming.canonical_event_id is null
          and canonical.canonical_slug = incoming.slug
      `;

      // Preserve the prior canonical route before promoting a renamed slug.
      await tx`
        insert into public.event_slug_aliases (slug, canonical_event_id)
        select canonical.canonical_slug, canonical.id
        from public.event_canonical_records as canonical
        join (
          select distinct canonical_event_id
          from event_archive_incoming
          where canonical_event_id is not null
        ) as seen on seen.canonical_event_id = canonical.id
        on conflict (slug) do update
          set last_seen_at = now()
        where public.event_slug_aliases.canonical_event_id =
          excluded.canonical_event_id
      `;
      await tx`
        insert into public.event_slug_aliases (slug, canonical_event_id)
        select incoming.slug, incoming.canonical_event_id
        from event_archive_incoming as incoming
        where incoming.canonical_event_id is not null
        on conflict (slug) do update
          set last_seen_at = now()
        where public.event_slug_aliases.canonical_event_id =
          excluded.canonical_event_id
      `;

      await tx`
        with desired as (
          select distinct on (canonical_event_id)
            canonical_event_id,
            slug
          from event_archive_incoming
          where canonical_event_id is not null
          order by canonical_event_id, verified_at desc, slug
        )
        update public.event_canonical_records as canonical
        set canonical_slug = desired.slug,
            updated_at = now()
        from desired
        where canonical.id = desired.canonical_event_id
          and canonical.canonical_slug <> desired.slug
          and not exists (
            select 1
            from public.event_canonical_records as other
            where other.canonical_slug = desired.slug
              and other.id <> canonical.id
          )
          and not exists (
            select 1
            from public.event_slug_aliases as other_alias
            where other_alias.slug = desired.slug
              and other_alias.canonical_event_id <> canonical.id
          )
      `;
      await tx`
        with newest as (
          select distinct on (canonical_event_id)
            canonical_event_id,
            snapshot,
            starts_at,
            ends_at,
            event_status,
            source_url
          from event_archive_incoming
          where canonical_event_id is not null
          order by canonical_event_id, verified_at desc, slug
        )
        update public.event_canonical_records as canonical
        set snapshot = newest.snapshot,
            starts_at = newest.starts_at,
            ends_at = newest.ends_at,
            event_status = newest.event_status,
            source_url = newest.source_url,
            last_seen_at = now(),
            snapshot_at = now(),
            updated_at = now()
        from newest
        where canonical.id = newest.canonical_event_id
      `;
      await tx`
        insert into public.event_source_identities (
          source,
          source_uid,
          canonical_event_id
        )
        select
          incoming.source,
          incoming.source_uid,
          incoming.canonical_event_id
        from event_archive_incoming as incoming
        where incoming.canonical_event_id is not null
        on conflict (source, source_uid) do update
          set last_seen_at = now()
        where public.event_source_identities.canonical_event_id =
          excluded.canonical_event_id
      `;
      await tx`
        delete from public.event_tombstones as tombstone
        using event_archive_incoming as incoming
        where tombstone.canonical_event_id = incoming.canonical_event_id
      `;
      const count = await tx<{
        upserted: number;
        ignored_lifecycle_only: number;
      }[]>`
        select
          count(*) filter (
            where canonical_event_id is not null
          )::int as upserted,
          count(*) filter (
            where canonical_event_id is null
              and event_status in ('cancelled', 'postponed')
          )::int as ignored_lifecycle_only
        from event_archive_incoming
      `;
      return {
        upserted: count[0]?.upserted ?? 0,
        ignoredLifecycleOnly:
          count[0]?.ignored_lifecycle_only ?? 0,
      };
    });
  },

  async tombstoneMissing(seen, successfulSources, context) {
    const sql = getSql();
    if (
      !sql ||
      successfulSources.length === 0 ||
      Date.now() >= context.deadlineAt
    ) {
      return 0;
    }
    const cutoff = new Date(context.now.getTime() - context.graceMs);
    return sql.begin(async (tx) => {
      const remainingMs = Math.max(100, context.deadlineAt - Date.now());
      await tx`
        select
          set_config('statement_timeout', ${`${remainingMs}ms`}, true),
          set_config('lock_timeout', '1500ms', true)
      `;
      await tx`
        create temporary table event_archive_seen (
          source text not null,
          source_uid text not null,
          primary key (source, source_uid)
        ) on commit drop
      `;
      await tx`
        create temporary table event_archive_success_sources (
          source text primary key
        ) on commit drop
      `;
      await tx`
        insert into event_archive_seen (source, source_uid)
        select seen.source, seen.source_uid
        from jsonb_to_recordset(
          ${archiveJsonText(seen)}::jsonb
        ) as seen(
          source text,
          source_uid text
        )
        on conflict do nothing
      `;
      await tx`
        insert into event_archive_success_sources (source)
        select value
        from jsonb_array_elements_text(
          ${archiveJsonText(successfulSources)}::jsonb
        ) as source(value)
        on conflict do nothing
      `;
      const rows = await tx<{ canonical_event_id: string }[]>`
        insert into public.event_tombstones (
          canonical_event_id,
          last_snapshot,
          reason,
          source_last_seen_at
        )
        select distinct
          canonical.id,
          canonical.snapshot,
          'expired',
          canonical.last_seen_at
        from public.event_canonical_records as canonical
        join public.event_source_identities as identity
          on identity.canonical_event_id = canonical.id
        join event_archive_success_sources as successful
          on successful.source = identity.source
        where canonical.last_seen_at < ${cutoff}
          and coalesce(canonical.ends_at, canonical.starts_at) < ${cutoff}
          and not exists (
            select 1
            from event_archive_seen as seen
            where seen.source = identity.source
              and seen.source_uid = identity.source_uid
          )
          and not exists (
            select 1
            from event_archive_seen as current_identity
            join public.event_source_identities as current_source
              on current_source.source = current_identity.source
             and current_source.source_uid = current_identity.source_uid
            where current_source.canonical_event_id = canonical.id
          )
        on conflict (canonical_event_id) do update
          set last_snapshot = excluded.last_snapshot,
              reason = excluded.reason,
              source_last_seen_at = excluded.source_last_seen_at,
              tombstoned_at = now()
        returning canonical_event_id
      `;
      return rows.length;
    });
  },
};

type BatchDeadlineOutcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown }
  | { status: "timed_out" };

function safeFailureCode(error: unknown): string | null {
  const candidate =
    typeof error === "object" && error !== null
      ? typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : typeof (error as { name?: unknown }).name === "string"
          ? (error as { name: string }).name
          : null
      : null;
  return candidate && /^[A-Za-z0-9_.-]{1,64}$/.test(candidate)
    ? candidate
    : null;
}

function isTransientDatabaseFailure(error: unknown): boolean {
  const code = safeFailureCode(error);
  return code !== null && TRANSIENT_DATABASE_CODES.has(code);
}

/** Fail before source assembly when migration 0038 is not fully deployed. */
export async function preflightEventArchive(): Promise<EventSchemaReadiness> {
  const sql = getSql();
  if (!sql) {
    return { ready: false, missing: ["database.connection"] };
  }
  return checkEventSchemaReadiness(sql, "event-archive");
}

async function beforeDeadline<T>(
  promise: Promise<T>,
  deadlineAt: number,
  clock: () => number,
): Promise<BatchDeadlineOutcome<T>> {
  const remaining = deadlineAt - clock();
  if (remaining <= 0) return { status: "timed_out" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then<BatchDeadlineOutcome<T>, BatchDeadlineOutcome<T>>(
        (value) => ({ status: "fulfilled", value }),
        (error: unknown) => ({ status: "rejected", error }),
      ),
      new Promise<BatchDeadlineOutcome<T>>((resolve) => {
        timer = setTimeout(
          () => resolve({ status: "timed_out" }),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function syncEventArchiveBatchWithWriter(
  events: readonly EventWithMeta[],
  options: InternalEventArchiveBatchOptions,
  writer: EventArchiveBatchWriter,
): Promise<EventArchiveBatchResult> {
  const clock = options.clock ?? Date.now;
  const batchSize = clampInteger(
    options.batchSize,
    EVENT_ARCHIVE_BATCH_SIZE,
    1,
    250,
  );
  const deadlineMs = clampInteger(
    options.deadlineMs,
    EVENT_ARCHIVE_DEADLINE_MS,
    100,
    15_000,
  );
  const prepared = prepareEventArchiveRows(
    events,
    options.maxEvents ?? EVENT_ARCHIVE_MAX_EVENTS,
  );
  const successfulSources = [
    ...new Set(
      (options.successfulSources ?? [])
        .map((source) => source.trim())
        .filter(Boolean),
    ),
  ];
  const seenSourceIdentities = [
    ...new Map(
      (options.seenSourceIdentities ?? [])
        .map(({ source, source_uid }) => ({
          source: source.trim().slice(0, 120),
          source_uid: source_uid.trim().slice(0, 1000),
        }))
        .filter(({ source, source_uid }) => source && source_uid)
        .map((identity) => [
          `${identity.source}\u0000${identity.source_uid}`,
          identity,
        ]),
    ).values(),
  ];
  const startedAt = clock();
  const deadlineAt = startedAt + deadlineMs;
  let upserted = 0;
  let ignoredLifecycleOnly = 0;
  let batches = 0;
  let retries = 0;
  let failure: EventArchiveBatchFailure | null = null;
  const maxTransientRetries = clampInteger(
    options.maxTransientRetries,
    EVENT_ARCHIVE_MAX_TRANSIENT_RETRIES,
    0,
    2,
  );

  for (let offset = 0; offset < prepared.rows.length; offset += batchSize) {
    if (clock() >= deadlineAt) {
      failure = {
        stage: "upsert",
        reason: "timed_out",
        code: null,
      };
      break;
    }
    const batch = prepared.rows.slice(offset, offset + batchSize);
    let outcome: BatchDeadlineOutcome<EventArchiveBatchWriteResult>;
    let transientAttempts = 0;
    do {
      outcome = await beforeDeadline(
        writer.upsert(batch, { deadlineAt }),
        deadlineAt,
        clock,
      );
      if (
        outcome.status === "rejected"
        && isTransientDatabaseFailure(outcome.error)
        && transientAttempts < maxTransientRetries
        && clock() < deadlineAt
      ) {
        transientAttempts += 1;
        retries += 1;
        continue;
      }
      break;
    } while (true);
    if (outcome.status !== "fulfilled") {
      failure = {
        stage: "upsert",
        reason: outcome.status,
        code:
          outcome.status === "rejected"
            ? safeFailureCode(outcome.error)
            : null,
      };
      break;
    }
    const written = outcome.value;
    upserted += written.upserted;
    ignoredLifecycleOnly += written.ignoredLifecycleOnly;
    batches++;
    if (
      written.upserted + written.ignoredLifecycleOnly !== batch.length
    ) {
      failure = {
        stage: "upsert",
        reason: "rejected",
        code: "incomplete-batch",
      };
      break;
    }
  }

  const recordsComplete =
    !prepared.truncated &&
    failure?.stage !== "upsert" &&
    upserted + ignoredLifecycleOnly === prepared.rows.length;
  const tombstonesEnabled =
    recordsComplete &&
    options.seenSourceIdentities !== undefined &&
    successfulSources.length > 0 &&
    typeof writer.tombstoneMissing === "function";
  let tombstoned = 0;
  if (tombstonesEnabled) {
    if (clock() >= deadlineAt) {
      failure = {
        stage: "tombstone",
        reason: "timed_out",
        code: null,
      };
    } else {
      let outcome: BatchDeadlineOutcome<number>;
      let transientAttempts = 0;
      do {
        outcome = await beforeDeadline(
          writer.tombstoneMissing!(
            seenSourceIdentities,
            successfulSources,
            {
              deadlineAt,
              now: new Date(startedAt),
              graceMs: clampInteger(
                options.graceMs,
                EVENT_ARCHIVE_TOMBSTONE_GRACE_MS,
                24 * 60 * 60_000,
                30 * 24 * 60 * 60_000,
              ),
            },
          ),
          deadlineAt,
          clock,
        );
        if (
          outcome.status === "rejected"
          && isTransientDatabaseFailure(outcome.error)
          && transientAttempts < maxTransientRetries
          && clock() < deadlineAt
        ) {
          transientAttempts += 1;
          retries += 1;
          continue;
        }
        break;
      } while (true);
      if (outcome.status === "fulfilled") {
        tombstoned = outcome.value;
      } else {
        failure = {
          stage: "tombstone",
          reason: outcome.status,
          code:
            outcome.status === "rejected"
              ? safeFailureCode(outcome.error)
              : null,
        };
      }
    }
  }

  return {
    complete: recordsComplete && failure === null,
    recordsComplete,
    accepted: prepared.rows.length,
    upserted,
    ignoredLifecycleOnly,
    tombstoned,
    batches,
    truncated: prepared.truncated,
    timedOut: failure?.reason === "timed_out",
    tombstonesEnabled,
    retries,
    failure,
  };
}

export function syncEventArchiveBatch(
  events: readonly EventWithMeta[],
  options: EventArchiveBatchOptions = {},
): Promise<EventArchiveBatchResult> {
  return syncEventArchiveBatchWithWriter(events, options, postgresWriter);
}
