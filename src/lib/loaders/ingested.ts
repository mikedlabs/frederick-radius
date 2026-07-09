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
import { cleanFeedText, formatAddress } from "@/lib/format/text";
import {
  normalizeTitle,
  etYear,
  cleanDescription,
  cleanVenueName,
  clampDescription,
} from "@/lib/events/normalize";

// Phase 1.6: drop venue open-status and routine recurring class/work
// sessions. Default ON by owner directive (2026-05-16: "ship
// everything"). Set RADIUS_EVENT_NOISE_FILTER=0 to disable.
const EVENT_NOISE_FILTER = process.env.RADIUS_EVENT_NOISE_FILTER !== "0";

// Sources whose category is set deliberately at the mapper boundary (not the
// unreliable county catid mapping), so it's safe to keep + surface.
const RELIABLE_CATEGORY_DOMAINS = new Set(["frederick.librarycalendar.com", "fcvfra.com"]);

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
  /** Presenting org split from an "Org-Event" title by normalizeTitle. */
  presenter?: string;
  venueName: string | null;
  address: string | null;
  municipality: string;
  /** Ingest source domain (e.g. fcvfra.com, frederick.librarycalendar.com) —
   *  lets a consumer scope to a source (the rails-lift includes only the
   *  library + fire-company sources; everything else stays civic-only). */
  sourceDomain: string;
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
  source_domain: string;
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
      select source_uid, source_domain, source_url, title, description, starts_at_utc, ends_at_utc,
             all_day, venue_name, address, lat, lng, municipality, category
      from ingested_events
      where starts_at_utc >= ${since}
      order by starts_at_utc asc
      limit ${limit}
    `) as unknown as Row[];
  } catch {
    return [];
  }

  // Sanitize the venue at the SOURCE row so BOTH the series key and the
  // displayed venue use clean values — a feed that dumped its description
  // into the LOCATION field (the Bee City subcommittee) must leak into
  // neither. cleanVenueName nulls a junk venue; the key then falls back to
  // address/empty.
  for (const r of rows) {
    r.venue_name = cleanVenueName(r.venue_name);
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
    // Sanitize at this read boundary, never in SeriesCard. Title gets
    // entity-decoded + presenter-split + hyphen/year-cleaned; venue and
    // description get decoded; the address also gets its concatenated
    // suffix-into-city repaired.
    const { presenter, title } = normalizeTitle(head.title, {
      year: etYear(head.starts_at_utc),
    });
    series.push({
      key,
      title,
      presenter,
      venueName: head.venue_name, // already cleaned + junk-nulled above
      address: head.address ? formatAddress(cleanFeedText(head.address)) : null,
      municipality: head.municipality,
      sourceDomain: head.source_domain,
      // Phase 1.5: the county catid mapping is unreliable (birthday
      // parties, theatre, and tasting rooms all arrive as "Workforce
      // Services"). Quarantine the surfaced label until the upstream
      // mapping is rebuilt. The raw value remains in ingested_events.
      // FCPL + FCVFRA set their category at the mapper boundary (library
      // program type / "community"), so keep theirs — only the county
      // catid mess is quarantined.
      category: RELIABLE_CATEGORY_DOMAINS.has(head.source_domain) ? head.category : null,
      lat: head.lat != null ? Number(head.lat) : null,
      lng: head.lng != null ? Number(head.lng) : null,
      // cleanDescription also dedupes repeated sentences (municipal CMS
      // feeds repeat whole paragraphs); the clamp keeps a 2,000-char
      // pricing/sponsorship dump from becoming a wall of text on any
      // surface (June-9 review §5, the techfrederick example).
      description: head.description
        ? clampDescription(cleanDescription(head.description), 320) || null
        : null,
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
  // v7: cleanTitle now strips trailing embedded weekday/date/time fragments
  // and de-shouts ALL-CAPS titles — the cached series titles change.
  // v6: splitPresenter paren/digit guards changed how titles normalize —
  // shape change must invalidate the persisted cache (the #509 lesson). The
  // deploy SHA is a second key segment so a forgotten version bump still
  // auto-busts on deploy.
  ["ingested-series-v7", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 3600, tags: ["ingested-events"] }
);

/** Count summary for headers. */
export async function getIngestedSummary(): Promise<{ total: number; series: number; recurring: number }> {
  const all = await getIngestedSeries();
  const recurring = all.filter((s) => s.isRecurring).length;
  const total = all.reduce((n, s) => n + s.count, 0);
  return { total, series: all.length, recurring };
}
