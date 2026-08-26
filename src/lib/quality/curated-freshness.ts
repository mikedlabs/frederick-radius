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
import { HOURS_MAX_AGE_DAYS } from "@/lib/hours-freshness";

const DAY = 86_400_000;

/**
 * How old the newest hours row may get before the board goes red.
 *
 * Sized to fire a full day before the outage, which takes two subtractions
 * rather than the obvious one. isHoursFresh publishes while `age <= 7 days`
 * (HOURS_MAX_AGE_DAYS), so coverage collapses to zero the instant the newest
 * row passes 7.0. snapshotFreshnessAnomaly compares `floor(ageInDays) >
 * maxAgeDays`, so a threshold of N first goes red at age N+1.
 *
 * That makes 8 — what shipped — red at 9.0, a full day AFTER every open and
 * closed claim in the app has already gone dark. It makes 6 red at exactly
 * 7.0, simultaneous with the cliff and worth minutes of warning. 5 goes red
 * at 6.0, which is the day of daylight this alarm exists to provide.
 */
export const HOURS_SNAPSHOT_MAX_AGE_DAYS = HOURS_MAX_AGE_DAYS - 2;
export const VENUE_SNAPSHOT_MAX_AGE_DAYS = 10;

type VenueFreshnessRow = {
  venue_slug?: string;
  source?: { fetchedAt?: string };
};

/**
 * Check each represented venue independently. A single newly refreshed venue
 * must not make another venue's frozen calendar look current.
 */
export function venueEventFreshnessAnomalies(
  rows: readonly VenueFreshnessRow[],
  now: Date,
  maxAgeDays = VENUE_SNAPSHOT_MAX_AGE_DAYS,
): Anomaly[] {
  const byVenue = new Map<string, string[]>();
  for (const row of rows) {
    const venue = row.venue_slug?.trim();
    if (!venue) continue;
    const stamps = byVenue.get(venue) ?? [];
    if (typeof row.source?.fetchedAt === "string") {
      stamps.push(row.source.fetchedAt);
    }
    byVenue.set(venue, stamps);
  }

  return [...byVenue.entries()].flatMap(([venue, stamps]) => {
    const valid = stamps
      .map((stamp) => Date.parse(stamp))
      .filter(Number.isFinite);
    if (valid.length === 0) {
      return [{
        source: `venue-events:${venue}`,
        kind: "snapshot_expired" as const,
        detail: `No valid collection timestamp exists for ${venue}. Run the venue ingest and review its source result.`,
      }];
    }
    const age = Math.floor((now.getTime() - Math.max(...valid)) / DAY);
    return age > maxAgeDays
      ? [{
          source: `venue-events:${venue}`,
          kind: "snapshot_expired" as const,
          detail: `${venue} was last collected ${age} days ago; the limit is ${maxAgeDays} days. Run the venue ingest and merge its reviewed data PR.`,
        }]
      : [];
  });
}

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
  const venueRows = VENUE_EVENTS as Array<{
    starts_at: string;
    venue_slug?: string;
    source?: { fetchedAt?: string };
  }>;
  const future = venueRows.filter((e) => Date.parse(e.starts_at) > now.getTime()).length;
  if (venueRows.length === 0 || future === 0) {
    out.push({
      source: "venue-events.json",
      kind: "snapshot_expired",
      detail: `${venueRows.length} rows, ${future} in the future — run \`npm run ingest:venues\` (ANTHROPIC_API_KEY for the render/image venues).`,
    });
  }
  out.push(...venueEventFreshnessAnomalies(venueRows, now));

  // 2. The app's trustworthy open/closed state depends on the materialized
  // rolling Google refresh, which carries both hours and business status.
  // The Vercel writer can populate the database, but it does not help users
  // unless the resulting artifact reaches the canonical loader. An empty or
  // old file is therefore a release-health failure, not an invisible advisory.
  const hoursEntries = Object.entries(
    HOURS_REFRESH as Record<string, unknown>,
  ).filter(([key]) => !key.startsWith("_"));
  // The window is one day TIGHTER than the publication window on purpose.
  // HOURS_MAX_AGE_DAYS is 7 (src/lib/hours-freshness.ts), so a row stops
  // being publishable exactly 7 days after its own stamp, and when the
  // NEWEST row crosses that line the catalog's verified-hours coverage is
  // zero — every open/closed claim in the app goes dark at once. This alarm
  // previously used 8, which meant it fired a full day AFTER that happened.
  // A warning that arrives after the outage is not a warning. Six gives a
  // day of daylight to notice a stalled writer and re-run the refresh.
  const hoursAnomaly = snapshotFreshnessAnomaly(
    "places-hours-refresh.json",
    hoursEntries.map(
      ([, value]) => (value as { refreshed_at?: string })?.refreshed_at,
    ),
    now,
    HOURS_SNAPSHOT_MAX_AGE_DAYS,
    "Run the hours-refresh cron through a full cycle, then pull and merge the data-steward PR.",
  );
  if (hoursAnomaly) out.push(hoursAnomaly);

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
