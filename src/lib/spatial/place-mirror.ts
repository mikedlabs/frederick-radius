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

export type SpatialMirrorAudit = {
  expectedCount: number;
  activeCount: number;
  expectedHash: string;
  actualHash: string;
  stateHash: string | null;
  stateCount: number | null;
  missing: string[];
  extra: string[];
  coordinateMismatches: string[];
  missingLocations: string[];
  current: boolean;
  syncedAt: string | null;
};

export type SpatialMirrorSyncResult = {
  upserted: number;
  retired: number;
  audit: SpatialMirrorAudit;
};

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
): Promise<SpatialMirrorAudit> {
  const expected = spatialCatalogSnapshot();
  let rows: MirrorRow[];
  let states: MirrorStateRow[];
  try {
    [rows, states] = await Promise.all([
      sql<MirrorRow[]>`
        select slug, lng, lat, (location is not null) as has_location
        from public.places
        where status = 'active'
          and deleted_at is null
        order by slug
      `,
      sql<MirrorStateRow[]>`
        select catalog_hash, place_count, synced_at
        from public.place_spatial_sync_state
        where catalog_key = ${expected.key}
        limit 1
      `,
    ]);
  } catch {
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
  const current =
    missing.length === 0 &&
    extra.length === 0 &&
    coordinateMismatches.length === 0 &&
    missingLocations.length === 0 &&
    actual.length === expected.count &&
    actualHash === expected.hash &&
    state?.catalog_hash === expected.hash &&
    stateCount === expected.count;

  return {
    expectedCount: expected.count,
    activeCount: actual.length,
    expectedHash: expected.hash,
    actualHash,
    stateHash: state?.catalog_hash ?? null,
    stateCount,
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
): Promise<void> {
  const payload = JSON.stringify(batch.map(mirrorPayload));
  await sql`
    insert into public.places (
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
  `;
}

export async function syncSpatialPlaceMirror(): Promise<SpatialMirrorSyncResult> {
  const rootSql = getSql();
  if (!rootSql) {
    throw new Error("DATABASE_URL is required to sync the PostGIS place mirror.");
  }
  const catalog = spatialCatalogSnapshot();
  let retired = 0;

  try {
    await rootSql.begin(async (sql) => {
      await sql`set local lock_timeout = '5s'`;
      await sql`set local statement_timeout = '90s'`;
      await sql`select pg_advisory_xact_lock(${SPATIAL_MIRROR_LOCK_ID})`;

      for (
        let offset = 0;
        offset < catalog.places.length;
        offset += MIRROR_BATCH_SIZE
      ) {
        await upsertBatch(
          sql,
          catalog.places.slice(offset, offset + MIRROR_BATCH_SIZE),
        );
      }

      const liveSlugs = catalog.places.map((place) => place.slug);
      const retiredRows = await sql<{ slug: string }[]>`
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
      `;
      retired = retiredRows.length;

      await sql`
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
      `;
    });
  } catch {
    throw new Error(
      "The PostGIS place mirror sync failed. Check the protected database logs.",
    );
  }

  const audit = await auditWithSql(rootSql);
  if (!audit.current) {
    throw new Error(
      "The PostGIS place mirror did not match the deployed catalog after sync.",
    );
  }
  return {
    upserted: catalog.count,
    retired,
    audit,
  };
}
