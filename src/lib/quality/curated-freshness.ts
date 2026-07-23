/**
 * Curated-freshness assertions — the data audit's meta-fix.
 *
 * Every P0 in docs/DATA_AUDIT.md shared one cause: curated snapshots and hand
 * verifications age with NO signal (venue-events expired 25-for-25; every
 * field-note says last_verified 2026-06; hours enrichment is a May snapshot).
 * These checks emit Anomaly-shaped rows so rot rides the existing data-health
 * Slack alert + admin dashboard instead of surfacing as a quiet blank.
 *
 * Pure reads over committed JSON — no fetches, safe in the cron's hot path.
 */
import type { Anomaly } from "@/lib/integrations/feed-snapshot";
import VENUE_EVENTS from "@/data/venue-events.json";
import FIELD_NOTES from "@/data/field-notes.json";
import CLIFFNOTES from "@/data/town-cliffnotes.json";
import HOURS_REFRESH from "@/data/places-hours-refresh.json";
import BUSINESS_STATUS from "@/data/business-status.json";

const DAY = 86_400_000;

/** last_verified strings are "YYYY-MM" or "YYYY-MM-DD"; parse leniently. */
function ageDays(verified: string | undefined, now: Date): number | null {
  if (!verified) return null;
  const t = Date.parse(verified.length === 7 ? `${verified}-01` : verified);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY) : null;
}

export function snapshotFreshnessAnomaly(
  source: string,
  verifiedAt: readonly (string | undefined)[],
  now: Date,
  maxAgeDays: number,
  remediation: string,
): Anomaly | null {
  const valid = verifiedAt
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  if (valid.length === 0) {
    return {
      source,
      kind: "snapshot_expired",
      detail: `No verified rows are materialized. ${remediation}`,
    };
  }

  const newest = Math.max(...valid);
  const age = Math.floor((now.getTime() - newest) / DAY);
  return age > maxAgeDays
    ? {
        source,
        kind: "snapshot_expired",
        detail: `Newest verified row is ${age} days old (limit ${maxAgeDays}). ${remediation}`,
      }
    : null;
}

export function curatedFreshnessAnomalies(now: Date = new Date()): Anomaly[] {
  const out: Anomaly[] = [];

  // 1. Venue-events snapshot must contain FUTURE events. When every row has
  //    passed, the source contributes zero and nobody can tell from the UI.
  const venueRows = VENUE_EVENTS as Array<{ starts_at: string }>;
  const future = venueRows.filter((e) => Date.parse(e.starts_at) > now.getTime()).length;
  if (venueRows.length === 0 || future === 0) {
    out.push({
      source: "venue-events.json",
      kind: "snapshot_expired",
      detail: `${venueRows.length} rows, ${future} in the future — run \`npm run ingest:venues\` (ANTHROPIC_API_KEY for the render/image venues).`,
    });
  }

  // 2. The app's trustworthy open/closed state depends on two materialized
  // Google refreshes. A Vercel cron can populate the database, and the
  // data-steward can spend on a status sweep, but neither helps users unless
  // the resulting artifact reaches the canonical loader. Empty or old files
  // are therefore release-health failures, not an invisible advisory.
  const hoursEntries = Object.entries(
    HOURS_REFRESH as Record<string, unknown>,
  ).filter(([key]) => !key.startsWith("_"));
  const hoursAnomaly = snapshotFreshnessAnomaly(
    "places-hours-refresh.json",
    hoursEntries.map(
      ([, value]) => (value as { refreshed_at?: string })?.refreshed_at,
    ),
    now,
    8,
    "Run the hours-refresh cron through a full cycle, then pull and merge the data-steward PR.",
  );
  if (hoursAnomaly) out.push(hoursAnomaly);

  const statusData = BUSINESS_STATUS as {
    generated_at?: string | null;
    overrides?: Record<string, { refreshed_at?: string }>;
  };
  const statusAnomaly = snapshotFreshnessAnomaly(
    "business-status.json",
    [
      statusData.generated_at ?? undefined,
      ...Object.values(statusData.overrides ?? {}).map(
        (entry) => entry.refreshed_at,
      ),
    ],
    now,
    2,
    "Check the data-steward Google secret and merge its latest status PR.",
  );
  if (statusAnomaly) out.push(statusAnomaly);

  // 3. Hand-verified curated layers: count entries whose last_verified is
  //    older than the re-verification window. One line per dataset, only
  //    when the stale share is meaningful (>25%), so a single aging note
  //    doesn't page anyone.
  const WINDOW_DAYS = 60;
  const noteAges: number[] = [];
  for (const entry of Object.values(FIELD_NOTES as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    for (const v of Object.values(entry as Record<string, unknown>)) {
      const items = Array.isArray(v) ? v : [v];
      for (const item of items) {
        const a = ageDays((item as { last_verified?: string })?.last_verified, now);
        if (a !== null) noteAges.push(a);
      }
    }
  }
  const staleNotes = noteAges.filter((a) => a > WINDOW_DAYS).length;
  if (noteAges.length > 0 && staleNotes / noteAges.length > 0.25) {
    out.push({
      source: "field-notes.json",
      kind: "verification_stale",
      detail: `${staleNotes}/${noteAges.length} verified items older than ${WINDOW_DAYS} days — schedule a re-verification pass.`,
    });
  }
  const towns = Object.values(CLIFFNOTES as Record<string, { last_verified?: string }>);
  const staleTowns = towns.filter((t) => (ageDays(t?.last_verified, now) ?? 0) > WINDOW_DAYS).length;
  if (towns.length > 0 && staleTowns / towns.length > 0.5) {
    out.push({
      source: "town-cliffnotes.json",
      kind: "verification_stale",
      detail: `${staleTowns}/${towns.length} towns verified more than ${WINDOW_DAYS} days ago.`,
    });
  }

  return out;
}

/** Live-feed failures, surfaced instead of discarded. A dead Ticketmaster
 *  looks identical to a quiet night everywhere else in the app; here it's a
 *  named report line. */
export function liveSourceAnomalies(sourcesFailed: string[]): Anomaly[] {
  return sourcesFailed.map((source) => ({
    source,
    kind: "live_source_failed" as const,
    detail: "Live feed failed this run. A successful empty response is tracked separately and does not trigger this anomaly.",
  }));
}
