#!/usr/bin/env node
/**
 * Materialize the place_hours_refresh table into the committed snapshot read
 * by the synchronous place loader.
 *
 * The pull is deliberately defensive. It never replaces a good artifact with
 * an empty, stale, malformed, or unexpectedly smaller database snapshot. The
 * Vercel writer and this GitHub pull are separate systems; success in one must
 * not let failure in the other silently erase open-now coverage.
 *
 * Preferred CI usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
 *   node scripts/pull-hours-refresh.mjs
 *
 * A direct DATABASE_URL remains supported for trusted local/admin runs. CI
 * should use the publishable-key path so it never holds a privileged database
 * credential.
 */
import postgres from "postgres";
import {
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 86_400_000;
const MAX_LATEST_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const HOURS_POLICY_MS = 7 * DAY_MS;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GOOGLE_BUSINESS_STATUSES = new Set([
  "OPERATIONAL",
  "CLOSED_TEMPORARILY",
  "CLOSED_PERMANENTLY",
  "UNKNOWN",
]);

const DOC =
  "Rolling hours refresh, pulled from the place_hours_refresh table by npm run refresh:hours. Keyed by slug and bound to the current public Google identity by place_id. Each entry overrides static enrichment hours and business status only while that identity still matches, with refreshed_at as the verification date the freshness policy reads. Written by scripts/pull-hours-refresh.mjs; do not edit by hand.";
const LEGACY_DOC =
  "Legacy rolling hours refresh artifact built without a public slug-to-place_id mapping. Rows may be read only by consumers that independently verify provider identity.";
const PUBLIC_COLUMNS = [
  "slug",
  "place_id",
  "weekday_hours",
  "business_status",
  "refreshed_at",
];
const REST_PAGE_SIZE = 1_000;
const MAX_REST_PAGES = 100;

function dataRows(artifact) {
  if (!artifact || typeof artifact !== "object") return [];
  return Object.keys(artifact).filter((key) => !key.startsWith("_"));
}

function asValidIso(value, slug, now) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    throw new Error(`Hours snapshot row ${slug} has an invalid refreshed_at value.`);
  }
  if (time - now.getTime() > MAX_FUTURE_SKEW_MS) {
    throw new Error(`Hours snapshot row ${slug} is dated in the future.`);
  }
  return date.toISOString();
}

/**
 * Build and validate the committed artifact without database I/O.
 * Exported so the safety boundary can be tested with fixed clocks.
 *
 * @param {Array<{
 *   slug?: unknown;
 *   place_id?: unknown;
 *   weekday_hours?: unknown;
 *   business_status?: unknown;
 *   refreshed_at?: unknown;
 * }>} rows
 * @param {{
 *   now?: Date;
 *   knownPlaces?: Iterable<{slug?: unknown; google_place_id?: unknown}>;
 *   knownSlugs?: Iterable<string>;
 *   existingArtifact?: Record<string, unknown>;
 * }} options
 */
export function buildHoursRefreshArtifact(
  rows,
  {
    now = new Date(),
    knownPlaces,
    knownSlugs,
    existingArtifact = {},
  } = /** @type {{
    now?: Date;
    knownPlaces?: Iterable<{slug?: unknown; google_place_id?: unknown}>;
    knownSlugs?: Iterable<string>;
    existingArtifact?: Record<string, unknown>;
  }} */ ({}),
) {
  const known = knownPlaces
    ? new Set()
    : knownSlugs
      ? new Set(knownSlugs)
      : null;
  const knownPlaceIds = knownPlaces ? new Map() : null;
  const knownIdOwners = knownPlaces ? new Map() : null;
  if (knownPlaces) {
    for (const place of knownPlaces) {
      const slug = typeof place?.slug === "string" ? place.slug.trim() : "";
      if (!slug) {
        throw new Error("The public catalog contains a place without a slug.");
      }
      if (known.has(slug)) {
        throw new Error(`The public catalog contains duplicate slug ${slug}.`);
      }
      known.add(slug);

      const placeId =
        typeof place?.google_place_id === "string"
          ? place.google_place_id.trim()
          : "";
      if (!placeId) continue;
      if (UUID_RE.test(placeId)) {
        throw new Error(
          `The public catalog row ${slug} has invalid Google Place ID ${placeId}.`,
        );
      }
      const owner = knownIdOwners.get(placeId);
      if (owner) {
        throw new Error(
          `The public catalog maps Google Place ID ${placeId} to both ${owner} and ${slug}.`,
        );
      }
      knownIdOwners.set(placeId, slug);
      knownPlaceIds.set(slug, placeId);
    }
  }
  const existingKnownRows = dataRows(existingArtifact).filter(
    (slug) => !known || known.has(slug),
  ).length;
  const normalized = [];
  const normalizedSlugs = new Set();
  let unmatchedRows = 0;

  for (const row of rows ?? []) {
    const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
    if (!slug) throw new Error("Hours snapshot contains a row without a slug.");
    if (known && !known.has(slug)) {
      unmatchedRows++;
      continue;
    }
    if (normalizedSlugs.has(slug)) {
      throw new Error(`Hours snapshot contains duplicate row ${slug}.`);
    }
    normalizedSlugs.add(slug);

    const placeId =
      typeof row.place_id === "string" ? row.place_id.trim() : "";
    if (placeId && UUID_RE.test(placeId)) {
      throw new Error(
        `Hours snapshot row ${slug} has invalid place_id ${placeId}.`,
      );
    }
    if (knownPlaceIds) {
      const expectedPlaceId = knownPlaceIds.get(slug);
      if (!expectedPlaceId) {
        throw new Error(
          `Hours snapshot row ${slug} no longer has a Google Place ID in the public catalog.`,
        );
      }
      if (!placeId) {
        throw new Error(`Hours snapshot row ${slug} is missing place_id.`);
      }
      if (placeId !== expectedPlaceId) {
        throw new Error(
          `Hours snapshot row ${slug} has place_id ${placeId}, but the public catalog maps it to ${expectedPlaceId}.`,
        );
      }
    }
    if (row.weekday_hours != null && !Array.isArray(row.weekday_hours)) {
      throw new Error(`Hours snapshot row ${slug} has malformed weekday_hours.`);
    }

    const weekdayHours = Array.isArray(row.weekday_hours)
      ? row.weekday_hours.filter(
          (line) => typeof line === "string" && line.trim().length > 0,
        )
      : [];
    if (
      row.business_status != null &&
      typeof row.business_status !== "string"
    ) {
      throw new Error(
        `Hours snapshot row ${slug} has malformed business_status.`,
      );
    }
    const businessStatus =
      typeof row.business_status === "string"
        ? row.business_status.trim()
        : "";
    if (
      businessStatus &&
      !GOOGLE_BUSINESS_STATUSES.has(businessStatus)
    ) {
      throw new Error(
        `Hours snapshot row ${slug} has unsupported business_status ${businessStatus}.`,
      );
    }
    const refreshedAt = asValidIso(row.refreshed_at, slug, now);
    normalized.push({
      slug,
      place_id: placeId || undefined,
      weekday_hours: weekdayHours,
      business_status: businessStatus || undefined,
      refreshed_at: refreshedAt,
    });
  }

  if (normalized.length === 0) {
    throw new Error(
      "place_hours_refresh has no rows for the current public catalog. Verify migration 0024, the Vercel hours cron, its feature flag, Google key, and database.",
    );
  }
  if (normalized.length < existingKnownRows) {
    throw new Error(
      `Refusing to shrink the committed hours snapshot from ${existingKnownRows} to ${normalized.length} current rows.`,
    );
  }

  normalized.sort((a, b) => a.slug.localeCompare(b.slug));
  const nowMs = now.getTime();
  const withSchedule = normalized.filter(
    (row) => row.weekday_hours.length > 0,
  );
  const recentRows = normalized.filter(
    (row) => nowMs - Date.parse(row.refreshed_at) <= MAX_LATEST_AGE_MS,
  );
  const recentScheduleRows = withSchedule.filter(
    (row) => nowMs - Date.parse(row.refreshed_at) <= MAX_LATEST_AGE_MS,
  );
  if (recentRows.length === 0) {
    throw new Error(
      "The newest database hours row is more than 36 hours old. The Vercel writer did not complete before this pull.",
    );
  }
  if (recentScheduleRows.length === 0) {
    throw new Error(
      "The latest database refresh produced no usable hours schedules. Refusing to publish a status-only snapshot as current hours.",
    );
  }

  const freshScheduleRows = withSchedule.filter(
    (row) => nowMs - Date.parse(row.refreshed_at) <= HOURS_POLICY_MS,
  );
  const timestamps = normalized.map((row) => Date.parse(row.refreshed_at));
  const summary = {
    rows: normalized.length,
    with_schedule: withSchedule.length,
    fresh_schedule_rows: freshScheduleRows.length,
    recent_rows: recentRows.length,
    unmatched_rows: unmatchedRows,
    oldest_refreshed_at: new Date(Math.min(...timestamps)).toISOString(),
    newest_refreshed_at: new Date(Math.max(...timestamps)).toISOString(),
  };

  const identityBound = Boolean(knownPlaceIds);
  const artifact = {
    _doc: identityBound ? DOC : LEGACY_DOC,
    _meta: {
      schema_version: identityBound ? 2 : 1,
      generated_at: now.toISOString(),
      ...summary,
    },
  };
  for (const row of normalized) {
    artifact[row.slug] = {
      ...(row.place_id ? { place_id: row.place_id } : {}),
      ...(row.weekday_hours.length > 0
        ? { weekday_hours: row.weekday_hours }
        : {}),
      ...(row.business_status
        ? { business_status: row.business_status }
        : {}),
      refreshed_at: row.refreshed_at,
    };
  }

  return { artifact, summary };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function safeDatabaseError(error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "42P01") {
    return new Error(
      "place_hours_refresh does not exist. Apply drizzle/0024_place_hours_refresh.sql in the Supabase SQL editor before enabling the paid cron.",
    );
  }
  return new Error(
    `Unable to read place_hours_refresh${code ? ` (Postgres ${code})` : ""}. Verify the trusted database URL and role.`,
  );
}

function safeDataApiError(status) {
  if (status === 401 || status === 403 || status === 404) {
    return new Error(
      `Unable to read place_hours_refresh through the Supabase Data API (HTTP ${status}). Apply drizzle/0034_expose_place_hours_refresh_read_only.sql and verify the project URL and publishable key.`,
    );
  }
  return new Error(
    `Unable to read place_hours_refresh through the Supabase Data API (HTTP ${status}).`,
  );
}

/**
 * Fetch every public hours row through Supabase's anon Data API role. The
 * response is paginated because Supabase projects commonly cap a single
 * PostgREST response at 1,000 rows while the Radius catalog is larger.
 *
 * @param {{
 *   supabaseUrl: string;
 *   publishableKey: string;
 *   fetchImpl?: typeof fetch;
 * }} options
 */
export async function fetchHoursRefreshRows({
  supabaseUrl,
  publishableKey,
  fetchImpl = fetch,
}) {
  const baseUrl = supabaseUrl.trim().replace(/\/+$/, "");
  const key = publishableKey.trim();
  if (!baseUrl || !key) {
    throw new Error(
      "Both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for the read-only Data API pull.",
    );
  }

  const rows = [];
  let offset = 0;
  for (let page = 0; page < MAX_REST_PAGES; page++) {
    const endpoint = new URL(`${baseUrl}/rest/v1/place_hours_refresh`);
    endpoint.searchParams.set("select", PUBLIC_COLUMNS.join(","));
    endpoint.searchParams.set("order", "slug.asc");
    endpoint.searchParams.set("limit", String(REST_PAGE_SIZE));
    endpoint.searchParams.set("offset", String(offset));

    const response = await fetchImpl(endpoint, {
      headers: {
        accept: "application/json",
        apikey: key,
      },
    });
    if (!response.ok) throw safeDataApiError(response.status);

    let batch;
    try {
      batch = await response.json();
    } catch {
      throw new Error(
        "Supabase Data API returned malformed JSON for place_hours_refresh.",
      );
    }
    if (!Array.isArray(batch)) {
      throw new Error(
        "Supabase Data API returned a non-array payload for place_hours_refresh.",
      );
    }
    if (batch.length === 0) return rows;

    rows.push(...batch);
    offset += batch.length;
  }

  throw new Error(
    `Supabase Data API pagination exceeded ${MAX_REST_PAGES} pages; refusing to publish a potentially incomplete hours snapshot.`,
  );
}

export async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL;
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  let rows;
  if (databaseUrl) {
    const sql = postgres(databaseUrl, { prepare: false, max: 1 });
    try {
      rows = await sql`
        SELECT slug, place_id, weekday_hours, business_status, refreshed_at
        FROM place_hours_refresh
        ORDER BY slug
      `;
    } catch (error) {
      throw safeDatabaseError(error);
    } finally {
      await sql.end();
    }
  } else if (supabaseUrl && publishableKey) {
    rows = await fetchHoursRefreshRows({
      supabaseUrl,
      publishableKey,
    });
  } else {
    throw new Error(
      "Configure either DATABASE_URL for a trusted direct pull, or NEXT_PUBLIC_SUPABASE_URL plus NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for a read-only Data API pull.",
    );
  }

  const dest = path.join(
    process.cwd(),
    "src",
    "data",
    "places-hours-refresh.json",
  );
  const publicPlacesFile = path.join(
    process.cwd(),
    "src",
    "data",
    "places-client.json",
  );
  const knownPlaces = readJson(publicPlacesFile);
  const existingArtifact = readJson(dest);
  const { artifact, summary } = buildHoursRefreshArtifact(rows, {
    knownPlaces,
    existingArtifact,
  });

  // Same-directory rename is atomic on the GitHub/Linux and local/macOS
  // filesystems. A killed process can leave a .tmp file, but never a truncated
  // canonical artifact.
  const temp = `${dest}.tmp`;
  writeFileSync(temp, `${JSON.stringify(artifact, null, 2)}\n`);
  renameSync(temp, dest);
  console.log(
    `Wrote ${summary.rows} refreshed rows (${summary.fresh_schedule_rows} fresh schedules) to ${dest}.`,
  );
  if (summary.unmatched_rows > 0) {
    console.warn(
      `Ignored ${summary.unmatched_rows} database rows that no longer match the public catalog.`,
    );
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
