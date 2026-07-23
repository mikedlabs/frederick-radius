#!/usr/bin/env node
/**
 * Pull the place_hours_refresh table into the committed
 * src/data/places-hours-refresh.json (data brief 4.3).
 *
 * The place loader is synchronous and reads committed JSON, so the
 * rolling refresh lands in two steps: the cron persists to Postgres
 * daily, and this script materializes the table for commit. Run it,
 * review the diff, commit. Same human-in-the-loop pattern as
 * refresh:business-status.
 *
 * Usage: DATABASE_URL=... node scripts/pull-hours-refresh.mjs
 */
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import path from "node:path";

const url =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("DATABASE_URL (or POSTGRES_URL / SUPABASE_DB_URL) is required.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

const rows = await sql`
  SELECT slug, weekday_hours, business_status, refreshed_at
  FROM place_hours_refresh
  ORDER BY slug
`;

if (rows.length === 0) {
  await sql.end();
  console.error(
    "place_hours_refresh is empty. Verify the Vercel hours cron, feature flag, Google key, and database before replacing the committed snapshot.",
  );
  process.exit(1);
}

const out = {
  _doc:
    "Rolling hours refresh, pulled from the place_hours_refresh table by npm run refresh:hours. Keyed by slug. Each entry overrides the static enrichment hours and business status for that place, with refreshed_at as the verification date the freshness policy reads. Written by scripts/pull-hours-refresh.mjs; do not edit by hand.",
};
for (const r of rows) {
  out[r.slug] = {
    weekday_hours: r.weekday_hours ?? undefined,
    business_status: r.business_status ?? undefined,
    refreshed_at: new Date(r.refreshed_at).toISOString(),
  };
}

const dest = path.join(process.cwd(), "src", "data", "places-hours-refresh.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${rows.length} refreshed rows to ${dest}`);
await sql.end();
