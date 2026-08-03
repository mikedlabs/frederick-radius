import "server-only";
import { getSql } from "@/lib/db/client";
import type { EventWithMeta } from "@/lib/loaders/events";
import { archiveJsonText } from "@/lib/events/archive-json";

export type ArchivedEventIdentity = {
  id: string;
  canonicalSlug: string;
  event: EventWithMeta;
  tombstoned: boolean;
  lastSeenAt: string;
};

export type PersistedEventIdentity = {
  id: string;
  canonicalSlug: string;
  snapshot: EventWithMeta;
};

type ArchiveRow = {
  id: string;
  canonical_slug: string;
  snapshot: unknown;
  tombstoned: boolean;
  last_seen_at: string | Date;
};

type IdentityRow = {
  id: string;
  canonical_slug: string;
};

type EventRouteRow = {
  canonical_slug: string;
  starts_at: string | Date;
  snapshot_at: string | Date;
};

export type UpcomingEventRoute = {
  slug: string;
  startsAt: string;
  lastModifiedAt: string;
};

type JsonValue =
  | null
  | string
  | number
  | boolean
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

type CancellablePromiseLike<T> = PromiseLike<T> & {
  cancel?: () => void;
};

const EVENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EVENT_IDENTITY_READ_TIMEOUT_MS = 450;
export const EVENT_IDENTITY_WRITE_TIMEOUT_MS = 650;

export class EventIdentityStoreUnavailableError extends Error {
  constructor() {
    super("The event identity store is unavailable.");
    this.name = "EventIdentityStoreUnavailableError";
  }
}

function finiteCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Snapshots are server-written, but validating the render contract keeps a
 * malformed/manual database row from turning a durable link into a page crash.
 */
export function archivedEventFromSnapshot(
  value: unknown,
  canonicalSlug?: string,
): EventWithMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const geom = row.geom;
  if (!geom || typeof geom !== "object" || Array.isArray(geom)) return null;
  const point = geom as Record<string, unknown>;
  const slug = canonicalSlug ?? row.slug;
  const requiredText = [
    row.title,
    row.starts_at,
    row.ends_at,
    row.timezone,
    row.venue_name,
    row.address,
    row.municipality,
    row.category,
    row.source,
    row.source_id,
    row.category_name,
    row.municipality_name,
    row.geo_confidence,
  ];
  if (
    typeof slug !== "string" ||
    !EVENT_SLUG.test(slug) ||
    requiredText.some((field) => typeof field !== "string") ||
    !Array.isArray(row.audience) ||
    typeof row.is_free !== "boolean" ||
    typeof row.is_verified !== "boolean" ||
    !finiteCoordinate(point.lng, -180, 180) ||
    !finiteCoordinate(point.lat, -90, 90) ||
    !Number.isFinite(Date.parse(String(row.starts_at))) ||
    !Number.isFinite(Date.parse(String(row.ends_at)))
  ) {
    return null;
  }
  return { ...(row as unknown as EventWithMeta), slug };
}

async function beforeDeadline<T>(
  pending: CancellablePromiseLike<T>,
  timeoutMs: number,
  signal?: AbortSignal,
  throwOnFailure = false,
): Promise<T | null> {
  if (signal?.aborted || timeoutMs <= 0) {
    try {
      pending.cancel?.();
    } catch {
      // Best-effort cancellation.
    }
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort: (() => void) | undefined;
  const guarded = Promise.resolve(pending).then(
    (value) => ({ status: "ok" as const, value }),
    () => ({ status: "failed" as const }),
  );
  const stopped = new Promise<{ status: "stopped" }>((resolve) => {
    timer = setTimeout(() => resolve({ status: "stopped" }), timeoutMs);
    if (signal) {
      const onAbort = () => resolve({ status: "stopped" });
      signal.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => signal.removeEventListener("abort", onAbort);
    }
  });

  try {
    const outcome = await Promise.race([guarded, stopped]);
    if (outcome.status === "stopped") {
      try {
        pending.cancel?.();
      } catch {
        // Best-effort cancellation; guarded consumes any late rejection.
      }
      if (throwOnFailure) throw new EventIdentityStoreUnavailableError();
      return null;
    }
    if (outcome.status === "failed" && throwOnFailure) {
      throw new EventIdentityStoreUnavailableError();
    }
    return outcome.status === "ok" ? outcome.value : null;
  } finally {
    if (timer) clearTimeout(timer);
    removeAbort?.();
  }
}

export async function archivedEventBySlug(
  slug: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ArchivedEventIdentity | null> {
  if (!EVENT_SLUG.test(slug)) return null;
  const sql = getSql();
  if (!sql) return null;

  const pending = sql<ArchiveRow[]>`
    select
      canonical.id,
      canonical.canonical_slug,
      coalesce(tombstone.last_snapshot, canonical.snapshot) as snapshot,
      (tombstone.canonical_event_id is not null) as tombstoned,
      canonical.last_seen_at
    from public.event_slug_aliases as alias
    join public.event_canonical_records as canonical
      on canonical.id = alias.canonical_event_id
    left join public.event_tombstones as tombstone
      on tombstone.canonical_event_id = canonical.id
    where alias.slug = ${slug}
    limit 1
  `;
  const rows = await beforeDeadline(
    pending,
    options.timeoutMs ?? EVENT_IDENTITY_READ_TIMEOUT_MS,
    options.signal,
    true,
  );
  const row = rows?.[0];
  if (!row) return null;
  const event = archivedEventFromSnapshot(row.snapshot, row.canonical_slug);
  if (!event) return null;
  return {
    id: row.id,
    canonicalSlug: row.canonical_slug,
    event,
    tombstoned: row.tombstoned,
    lastSeenAt:
      row.last_seen_at instanceof Date
        ? row.last_seen_at.toISOString()
        : String(row.last_seen_at),
  };
}

/**
 * A bounded list of durable, currently useful event routes for sitemap output.
 * This reads the same canonical archive that resolves shared event links, so
 * discovery never advertises a dynamic-feed slug the detail route cannot open.
 * Missing schema, an unavailable pool, or a slow query safely returns no rows;
 * the sitemap caller retains its committed curated/venue fallback.
 */
export async function upcomingArchivedEventRoutes(options: {
  now?: Date;
  horizonDays?: number;
  timeoutMs?: number;
} = {}): Promise<UpcomingEventRoute[]> {
  const sql = getSql();
  if (!sql) return [];
  const now = options.now ?? new Date();
  const horizonDays = Math.min(120, Math.max(1, options.horizonDays ?? 60));
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const until = new Date(now.getTime() + horizonDays * 86_400_000).toISOString();
  const pending = sql<EventRouteRow[]>`
    select
      canonical.canonical_slug,
      canonical.starts_at,
      canonical.snapshot_at
    from public.event_canonical_records as canonical
    join public.event_slug_aliases as alias
      on alias.slug = canonical.canonical_slug
     and alias.canonical_event_id = canonical.id
    left join public.event_tombstones as tombstone
      on tombstone.canonical_event_id = canonical.id
    where canonical.event_status = 'scheduled'
      and tombstone.canonical_event_id is null
      and coalesce(canonical.ends_at, canonical.starts_at) >= ${since}
      and canonical.starts_at <= ${until}
    order by canonical.starts_at asc
    limit 4000
  `;
  const rows = await beforeDeadline(
    pending,
    options.timeoutMs ?? EVENT_IDENTITY_READ_TIMEOUT_MS,
  );
  return (rows ?? [])
    .filter((row) => EVENT_SLUG.test(row.canonical_slug))
    .map((row) => ({
      slug: row.canonical_slug,
      startsAt:
        row.starts_at instanceof Date
          ? row.starts_at.toISOString()
          : String(row.starts_at),
      lastModifiedAt:
        row.snapshot_at instanceof Date
          ? row.snapshot_at.toISOString()
          : String(row.snapshot_at),
    }))
    .filter(
      (row) =>
        Number.isFinite(Date.parse(row.startsAt)) &&
        Number.isFinite(Date.parse(row.lastModifiedAt)),
    );
}

function snapshotObject(event: EventWithMeta, slug: string): JsonValue {
  return JSON.parse(JSON.stringify({ ...event, slug })) as JsonValue;
}

/**
 * Upsert by publisher UID, then attach every observed slug as an alias. A
 * source UID always wins over a title-derived route when deciding identity.
 */
export async function persistEventIdentity(
  event: EventWithMeta,
  aliases: readonly string[] = [],
  options: { timeoutMs?: number } = {},
): Promise<PersistedEventIdentity | null> {
  if (
    !EVENT_SLUG.test(event.slug) ||
    !event.source?.trim() ||
    !event.source_id?.trim() ||
    !archivedEventFromSnapshot(event)
  ) {
    return null;
  }
  const sql = getSql();
  if (!sql) return null;
  const usableAliases = [...new Set([event.slug, ...aliases])]
    .filter((slug) => EVENT_SLUG.test(slug))
    .slice(0, 12);
  const source = event.source.trim().slice(0, 120);
  const sourceUid = event.source_id.trim().slice(0, 1000);
  const startsAt = new Date(event.starts_at);
  const rawEndsAt = new Date(event.ends_at);
  const endsAt =
    Number.isFinite(rawEndsAt.getTime()) && rawEndsAt >= startsAt
      ? rawEndsAt
      : null;
  const eventStatus =
    event.status === "cancelled" || event.status === "postponed"
      ? event.status
      : "scheduled";

  const transaction = sql.begin(async (tx) => {
    let record = (
      await tx<IdentityRow[]>`
        select canonical.id, canonical.canonical_slug
        from public.event_source_identities as identity
        join public.event_canonical_records as canonical
          on canonical.id = identity.canonical_event_id
        where identity.source = ${source}
          and identity.source_uid = ${sourceUid}
        limit 1
      `
    )[0];

    if (!record) {
      record = (
        await tx<IdentityRow[]>`
          select canonical.id, canonical.canonical_slug
          from public.event_slug_aliases as alias
          join public.event_canonical_records as canonical
            on canonical.id = alias.canonical_event_id
          where alias.slug = ${event.slug}
          limit 1
        `
      )[0];
    }

    // A cancellation or postponement is an update to something Radius
    // already published, not a reason to create a brand-new event page. The
    // dedicated archive worker applies the same rule in bulk. Stable source
    // identity (or an old slug alias) still lets a real scheduled event
    // receive its new lifecycle status and snapshot below.
    if (!record && eventStatus !== "scheduled") return null;

    if (!record) {
      const inserted = await tx<IdentityRow[]>`
        insert into public.event_canonical_records (
          canonical_slug,
          snapshot,
          starts_at,
          ends_at,
          event_status,
          source_url
        )
        values (
          ${event.slug},
          ${archiveJsonText(snapshotObject(event, event.slug))}::jsonb,
          ${startsAt},
          ${endsAt},
          ${eventStatus},
          ${event.source_url ?? null}
        )
        on conflict (canonical_slug) do update
          set last_seen_at = now(),
              updated_at = now()
        returning id, canonical_slug
      `;
      record = inserted[0];
    }
    if (!record) return null;

    const oldCanonicalSlug = record.canonical_slug;
    let canonicalSlug = oldCanonicalSlug;
    const desiredClaim = (
      await tx<{ canonical_event_id: string }[]>`
        select canonical_event_id
        from public.event_slug_aliases
        where slug = ${event.slug}
        limit 1
      `
    )[0];
    if (!desiredClaim || desiredClaim.canonical_event_id === record.id) {
      await tx`
        insert into public.event_slug_aliases (slug, canonical_event_id)
        values (${oldCanonicalSlug}, ${record.id})
        on conflict (slug) do update
          set last_seen_at = now()
        where public.event_slug_aliases.canonical_event_id = excluded.canonical_event_id
      `;
      await tx`
        update public.event_canonical_records
        set canonical_slug = ${event.slug}
        where id = ${record.id}
      `;
      canonicalSlug = event.slug;
    }

    const snapshot = snapshotObject(event, canonicalSlug);
    await tx`
      update public.event_canonical_records
      set snapshot = ${archiveJsonText(snapshot)}::jsonb,
          starts_at = ${startsAt},
          ends_at = ${endsAt},
          event_status = ${eventStatus},
          source_url = ${event.source_url ?? null},
          last_seen_at = now(),
          snapshot_at = now(),
          updated_at = now()
      where id = ${record.id}
    `;
    await tx`
      insert into public.event_source_identities (
        source,
        source_uid,
        canonical_event_id
      )
      values (${source}, ${sourceUid}, ${record.id})
      on conflict (source, source_uid) do update
        set last_seen_at = now()
      where public.event_source_identities.canonical_event_id =
        excluded.canonical_event_id
    `;
    for (const alias of [...new Set([canonicalSlug, oldCanonicalSlug, ...usableAliases])]) {
      await tx`
        insert into public.event_slug_aliases (slug, canonical_event_id)
        values (${alias}, ${record.id})
        on conflict (slug) do update
          set last_seen_at = now()
        where public.event_slug_aliases.canonical_event_id =
          excluded.canonical_event_id
      `;
    }
    await tx`
      delete from public.event_tombstones
      where canonical_event_id = ${record.id}
    `;
    return {
      id: record.id,
      canonicalSlug,
      snapshot: { ...event, slug: canonicalSlug },
    } satisfies PersistedEventIdentity;
  });

  return beforeDeadline(
    transaction,
    options.timeoutMs ?? EVENT_IDENTITY_WRITE_TIMEOUT_MS,
  );
}

export async function tombstoneEventBySlug(
  slug: string,
  reason: "source_gone" | "expired" | "cancelled" | "merged" | "manual" = "source_gone",
): Promise<boolean> {
  const sql = getSql();
  if (!sql || !EVENT_SLUG.test(slug)) return false;
  const pending = sql<{ canonical_event_id: string }[]>`
    insert into public.event_tombstones (
      canonical_event_id,
      last_snapshot,
      reason,
      source_last_seen_at
    )
    select
      canonical.id,
      canonical.snapshot,
      ${reason},
      canonical.last_seen_at
    from public.event_slug_aliases as alias
    join public.event_canonical_records as canonical
      on canonical.id = alias.canonical_event_id
    where alias.slug = ${slug}
    on conflict (canonical_event_id) do update
      set last_snapshot = excluded.last_snapshot,
          reason = excluded.reason,
          source_last_seen_at = excluded.source_last_seen_at,
          tombstoned_at = now()
    returning canonical_event_id
  `;
  const rows = await beforeDeadline(
    pending,
    EVENT_IDENTITY_WRITE_TIMEOUT_MS,
  );
  return Boolean(rows?.length);
}
