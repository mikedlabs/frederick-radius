#!/usr/bin/env node
/**
 * Materialize the server-only place_hours_refresh table into the committed
 * snapshot read by the synchronous place loader.
 *
 * The pull is deliberately defensive. It never replaces a good artifact with
 * an empty, stale, malformed, or unexpectedly smaller database snapshot. The
 * Vercel writer and this GitHub pull are separate systems; success in one must
 * not let failure in the other silently erase open-now coverage.
 *
 * Usage: DATABASE_URL=... node scripts/pull-hours-refresh.mjs
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

const DOC =
  "Rolling hours refresh, pulled from the place_hours_refresh table by npm run refresh:hours. Keyed by slug. Each entry overrides the static enrichment hours and business status for that place, with refreshed_at as the verification date the freshness policy reads. Written by scripts/pull-hours-refresh.mjs; do not edit by hand.";

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
 *   weekday_hours?: unknown;
 *   business_status?: unknown;
 *   refreshed_at?: unknown;
 * }>} rows
 * @param {{
 *   now?: Date;
 *   knownSlugs?: Iterable<string>;
 *   existingArtifact?: Record<string, unknown>;
 * }} options
 */
export function buildHoursRefreshArtifact(
  rows,
  {
    now = new Date(),
    knownSlugs,
    existingArtifact = {},
  } = /** @type {{
    now?: Date;
    knownSlugs?: Iterable<string>;
    existingArtifact?: Record<string, unknown>;
  }} */ ({}),
) {
  const known = knownSlugs ? new Set(knownSlugs) : null;
  const existingKnownRows = dataRows(existingArtifact).filter(
    (slug) => !known || known.has(slug),
  ).length;
  const normalized = [];
  let unmatchedRows = 0;

  for (const row of rows ?? []) {
    const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
    if (!slug) throw new Error("Hours snapshot contains a row without a slug.");
    if (known && !known.has(slug)) {
      unmatchedRows++;
      continue;
    }
    if (row.weekday_hours != null && !Array.isArray(row.weekday_hours)) {
      throw new Error(`Hours snapshot row ${slug} has malformed weekday_hours.`);
    }

    const weekdayHours = Array.isArray(row.weekday_hours)
      ? row.weekday_hours.filter(
          (line) => typeof line === "string" && line.trim().length > 0,
        )
      : [];
    const refreshedAt = asValidIso(row.refreshed_at, slug, now);
    normalized.push({
      slug,
      weekday_hours: weekdayHours,
      business_status:
        typeof row.business_status === "string"
          ? row.business_status
          : undefined,
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

  const artifact = {
    _doc: DOC,
    _meta: {
      schema_version: 1,
      generated_at: now.toISOString(),
      ...summary,
    },
  };
  for (const row of normalized) {
    artifact[row.slug] = {
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
    `Unable to read place_hours_refresh${code ? ` (Postgres ${code})` : ""}. Verify the GitHub DATABASE_URL secret and database role.`,
  );
}

export async function main() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL (or POSTGRES_URL / SUPABASE_DB_URL) is required.",
    );
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  let rows;
  try {
    rows = await sql`
      SELECT slug, weekday_hours, business_status, refreshed_at
      FROM place_hours_refresh
      ORDER BY slug
    `;
  } catch (error) {
    throw safeDatabaseError(error);
  } finally {
    await sql.end();
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
  const knownSlugs = readJson(publicPlacesFile).map((place) => place.slug);
  const existingArtifact = readJson(dest);
  const { artifact, summary } = buildHoursRefreshArtifact(rows, {
    knownSlugs,
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
