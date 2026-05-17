/**
 * DB-backed loader for the ~3,000 municipal events the CivicEngage pipeline
 * writes to `ingested_events`. Read-only, ISR-cached so we don't hammer the
 * pooler on every render.
 *
 * Recurring detection: CivicEngage emits each occurrence as its own VEVENT
 * (separate UID per date). We collapse them into a SERIES keyed on
 * normalized title + venue + municipality, so "Story Time at C. Burr Artz"
 * shows once as "Every Friday · 11 more dates" instead of 12 rows.
 */
import { unstable_cache } from "next/cache";
import { getSql } from "@/lib/db/client";
import { isVenueStatusNonEvent, isRoutineRecurringClass } from "@/lib/event-noise";

// Phase 1.6: drop venue open-status and routine recurring class/work
// sessions. Default ON by owner directive (2026-05-16: "ship
// everything"). Set RADIUS_EVENT_NOISE_FILTER=0 to disable.
const EVENT_NOISE_FILTER = process.env.RADIUS_EVENT_NOISE_FILTER !== "0";

export type IngestedOccurrence = {
  sourceUid: string;
  startsAtUtc: string;
  endsAtUtc: string | null;
  allDay: boolean;
  sourceUrl: string | null;
};

export type IngestedSeries = {
  /** stable key for routing/expansion */
  key: string;
  title: string;
  venueName: string | null;
  address: string | null;
  municipality: string;
  category: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  /** future occurrences, soonest first */
  occurrences: IngestedOccurrence[];
  /** convenience: occurrences.length */
  count: number;
  /** soonest start (UTC ISO) */
  nextStart: string;
  isRecurring: boolean;
};

type Row = {
  source_uid: string;
  source_url: string | null;
  title: string;
  description: string | null;
  starts_at_utc: string;
  ends_at_utc: string | null;
  all_day: boolean;
  venue_name: string | null;
  address: string | null;
  lat: string | null;
  lng: string | null;
  municipality: string;
  category: string | null;
};

function seriesKeyOf(r: Row): string {
  const title = r.title.trim().toLowerCase().replace(/\s+/g, " ");
  const venue = (r.venue_name ?? r.address ?? "").trim().toLowerCase();
  return `${r.municipality.toLowerCase()}|${title}|${venue}`;
}

async function loadUpcoming(limit: number): Promise<IngestedSeries[]> {
  const sql = getSql();
  if (!sql) return [];
  // Future + slightly-past (started today) events only.
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  let rows: Row[];
  try {
    rows = (await sql<Row[]>`
      select source_uid, source_url, title, description, starts_at_utc, ends_at_utc,
             all_day, venue_name, address, lat, lng, municipality, category
      from ingested_events
      where starts_at_utc >= ${since}
      order by starts_at_utc asc
      limit ${limit}
    `) as unknown as Row[];
  } catch {
    return [];
  }

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = seriesKeyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const series: IngestedSeries[] = [];
  for (const [key, rs] of groups) {
    rs.sort((a, b) => +new Date(a.starts_at_utc) - +new Date(b.starts_at_utc));
    const head = rs[0];
    series.push({
      key,
      title: head.title,
      venueName: head.venue_name,
      address: head.address,
      municipality: head.municipality,
      // Phase 1.5: the county catid mapping is unreliable (birthday
      // parties, theatre, and tasting rooms all arrive as "Workforce
      // Services"). Quarantine the surfaced label until the upstream
      // mapping is rebuilt. The raw value remains in ingested_events.
      category: null,
      lat: head.lat != null ? Number(head.lat) : null,
      lng: head.lng != null ? Number(head.lng) : null,
      description: head.description,
      occurrences: rs.map((r) => ({
        sourceUid: r.source_uid,
        startsAtUtc: r.starts_at_utc,
        endsAtUtc: r.ends_at_utc,
        allDay: r.all_day,
        sourceUrl: r.source_url,
      })),
      count: rs.length,
      nextStart: head.starts_at_utc,
      isRecurring: rs.length > 1,
    });
  }
  const visible = EVENT_NOISE_FILTER
    ? series.filter(
        (s) =>
          !isVenueStatusNonEvent(s.title) &&
          !(s.isRecurring && isRoutineRecurringClass(s.title)),
      )
    : series;
  visible.sort((a, b) => +new Date(a.nextStart) - +new Date(b.nextStart));
  return visible;
}

/** ISR-cached (1h) — the cron refreshes the data daily, hourly is plenty. */
export const getIngestedSeries = unstable_cache(
  async (limit = 4000) => loadUpcoming(limit),
  ["ingested-series-v1"],
  { revalidate: 3600, tags: ["ingested-events"] }
);

/** Count summary for headers. */
export async function getIngestedSummary(): Promise<{ total: number; series: number; recurring: number }> {
  const all = await getIngestedSeries();
  const recurring = all.filter((s) => s.isRecurring).length;
  const total = all.reduce((n, s) => n + s.count, 0);
  return { total, series: all.length, recurring };
}
