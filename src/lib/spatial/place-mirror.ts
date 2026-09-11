/**
 * Synchronize public.places with the exact deploy-time place catalog used by
 * the app. The transaction updates coordinates, retires rows no longer public,
 * and writes the checksum last. Runtime PostGIS reads only trust a matching
 * checksum, so an interrupted or stale sync always falls back safely.
 */
import type { TransactionSql } from "postgres";
import { getSql } from "@/lib/db/client";
import {
  hashSpatialPlaces,
  spatialCatalogSnapshot,
  type SpatialCatalogPlace,
} from "@/lib/spatial/place-catalog";

const MIRROR_BATCH_SIZE = 250;
const SPATIAL_MIRROR_LOCK_ID = 28_417_392;
const COORD_EPSILON = 1e-9;

type MirrorRow = {
  slug: string;
  lng: number | string;
  lat: number | string;
  has_location: boolean;
};

type MirrorStateRow = {
  catalog_hash: string;
  place_count: number;
  synced_at: Date | string;
};

type CancellablePromiseLike<T> = PromiseLike<T> & {
  cancel?: () => void;
};

export type SpatialMirrorSyncOptions = {
  signal?: AbortSignal;
  statementTimeoutMs?: number;
};

export type SpatialMirrorAudit = {
  expectedCount: number;
  activeCount: number;
  expectedHash: string;
  actualHash: string;
  stateHash: string | null;
  stateCount: number | null;
  actualHashMatchesExpected: boolean;
  stateHashMatchesExpected: boolean;
  stateCountMatchesExpected: boolean;
  missing: string[];
  extra: string[];
  coordinateMismatches: string[];
  missingLocations: string[];
  current: boolean;
  syncedAt: string | null;
};

export type SpatialMirrorSyncResult = {
  checked: number;
  upserted: number;
  retired: number;
  audit: SpatialMirrorAudit;
};

function spatialAbortError(): Error {
  const error = new Error("The PostGIS place mirror sync was cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw spatialAbortError();
}

/**
 * postgres-js exposes cancel() on every pending query. Tie that cancellation
 * to the route deadline so a timed-out serverless request cannot leave a
 * database statement running in the background. Late settlements are still
 * consumed, and the surrounding transaction rolls back before retirement or
 * the trust checksum can be published.
 */
async function awaitCancellable<T>(
  query: CancellablePromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return Promise.resolve(query);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanUp = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanUp();
      try {
        query.cancel?.();
      } catch {
        // The deadline still rejects the transaction even if the driver has
        // already settled and throws while processing a redundant cancel.
      }
      reject(spatialAbortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(query).then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanUp();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanUp();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

function normalizedMirrorRows(rows: readonly MirrorRow[]) {
  return rows.map((row) => ({
    slug: row.slug,
    lng: Number(row.lng),
    lat: Number(row.lat),
    hasLocation: row.has_location,
  }));
}

async function auditWithSql(
  sql: NonNullable<ReturnType<typeof getSql>>,
  signal?: AbortSignal,
): Promise<SpatialMirrorAudit> {
  const expected = spatialCatalogSnapshot();
  let rows: MirrorRow[];
  let states: MirrorStateRow[];
  try {
    rows = await awaitCancellable(
      sql<MirrorRow[]>`
        select slug, lng, lat, (location is not null) as has_location
        from public.places
        where status = 'active'
          and deleted_at is null
        order by slug
      `,
      signal,
    );
    states = await awaitCancellable(
      sql<MirrorStateRow[]>`
        select catalog_hash, place_count, synced_at
        from public.place_spatial_sync_state
        where catalog_key = ${expected.key}
        limit 1
      `,
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "The PostGIS place mirror is unavailable. Apply drizzle/0037_places_postgis.sql first.",
    );
  }

  const actual = normalizedMirrorRows(rows);
  const expectedBySlug = new Map(
    expected.places.map((place) => [place.slug, place]),
  );
  const actualBySlug = new Map(actual.map((place) => [place.slug, place]));
  const missing = expected.places
    .filter((place) => !actualBySlug.has(place.slug))
    .map((place) => place.slug);
  const extra = actual
    .filter((place) => !expectedBySlug.has(place.slug))
    .map((place) => place.slug);
  const coordinateMismatches = expected.places
    .filter((place) => {
      const mirror = actualBySlug.get(place.slug);
      return Boolean(
        mirror &&
          (Math.abs(mirror.lng - place.lng) > COORD_EPSILON ||
            Math.abs(mirror.lat - place.lat) > COORD_EPSILON),
      );
    })
    .map((place) => place.slug);
  const missingLocations = actual
    .filter((place) => !place.hasLocation)
    .map((place) => place.slug);
  const actualHash = hashSpatialPlaces(actual);
  const state = states[0];
  const stateCount = state ? Number(state.place_count) : null;
  const actualHashMatchesExpected = actualHash === expected.hash;
  const stateHashMatchesExpected = state?.catalog_hash === expected.hash;
  const stateCountMatchesExpected = stateCount === expected.count;
  const current =
    missing.length === 0 &&
    extra.length === 0 &&
    coordinateMismatches.length === 0 &&
    missingLocations.length === 0 &&
    actual.length === expected.count &&
    // Row coordinates already use the explicit sub-millimeter tolerance
    // above. An exact JSON hash can differ after a valid double-precision
    // database round trip even when every coordinate is inside that contract.
    // Keep the exact hash as a diagnostic, but do not let it contradict the
    // row-level comparison. The stamped deploy hash remains mandatory, so a
    // genuinely stale or interrupted sync still fails closed.
    stateHashMatchesExpected &&
    stateCountMatchesExpected;

  return {
    expectedCount: expected.count,
    activeCount: actual.length,
    expectedHash: expected.hash,
    actualHash,
    stateHash: state?.catalog_hash ?? null,
    stateCount,
    actualHashMatchesExpected,
    stateHashMatchesExpected,
    stateCountMatchesExpected,
    missing,
    extra,
    coordinateMismatches,
    missingLocations,
    current,
    syncedAt: state ? new Date(state.synced_at).toISOString() : null,
  };
}

export async function auditSpatialPlaceMirror(): Promise<SpatialMirrorAudit> {
  const sql = getSql();
  if (!sql) {
    throw new Error("DATABASE_URL is required to audit the PostGIS place mirror.");
  }
  return auditWithSql(sql);
}

function mirrorPayload(place: SpatialCatalogPlace) {
  return {
    slug: place.slug,
    name: place.name,
    category_slug: place.category,
    municipality_slug: place.municipality,
    address: place.address,
    city: place.city,
    state: place.state,
    postal_code: place.postalCode,
    source: place.source,
    lng: place.lng,
    lat: place.lat,
  };
}

async function upsertBatch(
  sql: TransactionSql,
  batch: readonly SpatialCatalogPlace[],
  signal?: AbortSignal,
): Promise<number> {
  const payload = JSON.stringify(batch.map(mirrorPayload));
  const changed = await awaitCancellable(
    sql<{ slug: string }[]>`
      insert into public.places as target (
      slug,
      name,
      category_slug,
      municipality_slug,
      address,
      city,
      state,
      postal_code,
      source,
      lng,
      lat,
      status,
      deleted_at,
      updated_at
    )
    select
      row.slug,
      row.name,
      row.category_slug,
      row.municipality_slug,
      row.address,
      row.city,
      row.state,
      row.postal_code,
      row.source,
      row.lng,
      row.lat,
      'active',
      null,
      now()
    from jsonb_to_recordset(${payload}::jsonb) as row(
      slug text,
      name text,
      category_slug text,
      municipality_slug text,
      address text,
      city text,
      state text,
      postal_code text,
      source text,
      lng double precision,
      lat double precision
    )
    on conflict (slug) do update set
      name = excluded.name,
      category_slug = excluded.category_slug,
      municipality_slug = excluded.municipality_slug,
      address = excluded.address,
      city = excluded.city,
      state = excluded.state,
      postal_code = excluded.postal_code,
      source = excluded.source,
      lng = excluded.lng,
      lat = excluded.lat,
      status = 'active',
      deleted_at = null,
      updated_at = excluded.updated_at
    where (
      target.name,
      target.category_slug,
      target.municipality_slug,
      target.address,
      target.city,
      target.state,
      target.postal_code,
      target.source,
      target.lng,
      target.lat,
      target.status,
      target.deleted_at
    ) is distinct from (
      excluded.name,
      excluded.category_slug,
      excluded.municipality_slug,
      excluded.address,
      excluded.city,
      excluded.state,
      excluded.postal_code,
      excluded.source,
      excluded.lng,
      excluded.lat,
      excluded.status,
      excluded.deleted_at
    )
      returning target.slug
    `,
    signal,
  );
  return changed.length;
}

export async function syncSpatialPlaceMirror(
  options: SpatialMirrorSyncOptions = {},
): Promise<SpatialMirrorSyncResult> {
  const rootSql = getSql();
  if (!rootSql) {
    throw new Error("DATABASE_URL is required to sync the PostGIS place mirror.");
  }
  const catalog = spatialCatalogSnapshot();
  const { signal } = options;
  const statementTimeoutMs = Math.max(
    1,
    Math.min(Math.floor(options.statementTimeoutMs ?? 20_000), 30_000),
  );
  let changed = 0;
  let retired = 0;

  try {
    throwIfAborted(signal);
    await rootSql.begin(async (sql) => {
      await awaitCancellable(sql`set local lock_timeout = '5s'`, signal);
      await awaitCancellable(
        sql`select set_config('statement_timeout', ${`${statementTimeoutMs}ms`}, true)`,
        signal,
      );
      await awaitCancellable(
        sql`select pg_advisory_xact_lock(${SPATIAL_MIRROR_LOCK_ID})`,
        signal,
      );

      for (
        let offset = 0;
        offset < catalog.places.length;
        offset += MIRROR_BATCH_SIZE
      ) {
        throwIfAborted(signal);
        changed += await upsertBatch(
          sql,
          catalog.places.slice(offset, offset + MIRROR_BATCH_SIZE),
          signal,
        );
      }

      throwIfAborted(signal);
      const liveSlugs = catalog.places.map((place) => place.slug);
      const retiredRows = await awaitCancellable(
        sql<{ slug: string }[]>`
          update public.places
        set
          status = 'inactive',
          deleted_at = coalesce(deleted_at, now()),
          updated_at = now()
        where not (slug = any(${liveSlugs}::text[]))
          and (
            status is distinct from 'inactive'
            or deleted_at is null
          )
          returning slug
        `,
        signal,
      );
      retired = retiredRows.length;

      throwIfAborted(signal);
      await awaitCancellable(
        sql`
          insert into public.place_spatial_sync_state (
          catalog_key,
          catalog_hash,
          place_count,
          synced_at
        )
        values (
          ${catalog.key},
          ${catalog.hash},
          ${catalog.count},
          now()
        )
        on conflict (catalog_key) do update set
          catalog_hash = excluded.catalog_hash,
          place_count = excluded.place_count,
            synced_at = excluded.synced_at
        `,
        signal,
      );
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "The PostGIS place mirror sync failed. Check the protected database logs.",
    );
  }

  throwIfAborted(signal);
  const audit = await auditWithSql(rootSql, signal);
  if (!audit.current) {
    throw new Error(
      "The PostGIS place mirror did not match the deployed catalog after sync " +
        `(expected=${audit.expectedCount}, active=${audit.activeCount}, ` +
        `missing=${audit.missing.length}, extra=${audit.extra.length}, ` +
        `coordinate_mismatches=${audit.coordinateMismatches.length}, ` +
        `missing_locations=${audit.missingLocations.length}, ` +
        `actual_hash_match=${audit.actualHashMatchesExpected}, ` +
        `state_hash_match=${audit.stateHashMatchesExpected}, ` +
        `state_count_match=${audit.stateCountMatchesExpected}, ` +
        `expected_hash=${audit.expectedHash.slice(0, 12)}, ` +
        `actual_hash=${audit.actualHash.slice(0, 12)}, ` +
        `state_hash=${audit.stateHash?.slice(0, 12) ?? "missing"}).`,
    );
  }
  return {
    checked: catalog.count,
    upserted: changed,
    retired,
    audit,
  };
}
