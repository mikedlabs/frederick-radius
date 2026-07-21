/**
 * What the public wire shows OVER TIME — the honest use of old calls.
 *
 * The live board answers "what's happening now"; this answers "where and when
 * things happen around here." Two sources feed it, and the deeper one wins:
 *
 *   - OUR ARCHIVE (scanner_incidents) — everything the scanner-archive cron has
 *     banked since the table went live. This is the only way to see PAST the
 *     ~3 weeks the public page keeps: it grows without limit, day after day.
 *   - THE PUBLIC PAGE (frederickscanner.com) — a rolling ~3 weeks. The bootstrap
 *     and the fallback: it's what we show before the archive has depth, and if
 *     the DB is dormant (not migrated) it's all we ever read.
 *
 * Both run through the SAME public-only allowlist as the live feed, and both
 * reduce to the same aggregation: crash hotspots, storm corridors, the daily
 * rhythm. Everything is aggregate, public, block-level road data (never a
 * medical or personal call — dropped upstream). No individual old call is
 * surfaced; only the pattern. Cached hourly.
 */
import { unstable_cache } from "next/cache";
import { gte } from "drizzle-orm";
import { publicIncident, type PublicIncidentKind } from "@/lib/scanner/incidentFeed";
import { getDb } from "@/lib/db/client";
import { scanner_incidents } from "@/lib/db/schema";
import { geocodeAddressInCounty } from "@/lib/integrations/mapboxGeocode";
import trafficCounts from "@/data/traffic-counts.json";

const SOURCE_URL = "https://frederickscanner.com/fredscannerpro/tweets.html";
/** How far back the archive read reaches. A year of local memory is plenty. */
const ARCHIVE_DAYS = 365;

export type SpotCount = {
  spot: string;
  count: number;
  /** Resolved through the county-gated geocoder so the spot can open on the
   *  map. Absent when the road couldn't be placed (then it renders as text). */
  lat?: number;
  lng?: number;
};
export type KindCount = { kind: PublicIncidentKind; count: number };

/** A crash hotspot the county has a traffic count for, so crashes can be read
 *  against how many vehicles actually use the road. */
export type TrafficAdjusted = {
  spot: string;
  count: number;
  /** Vehicles per day, county count (most recent available). */
  aadt: number;
  /** Crashes per 1,000 vehicles/day — the rate the list is ranked by. */
  per1k: number;
};

export type ScannerPatterns = {
  /** Distinct calendar days the window covers. */
  days: number;
  /** Total public incidents counted in the window. */
  total: number;
  /** Roads/intersections crashes cluster on (>=2), most first. */
  crashSpots: SpotCount[];
  /** Roads that drop wires (>=2), most first. */
  wireSpots: SpotCount[];
  /** Crashes per hour of day, index 0–23. */
  byHour: number[];
  /** Public-call mix over the window, biggest first. */
  byKind: KindCount[];
  /** Hour of day (0–23) crashes peak at, or null if none. */
  peakHour: number | null;
  /** Crashes per weekday, index 0 (Sun) – 6 (Sat). */
  byWeekday: number[];
  /** Weekday (0–6) crashes peak at, or null if none. */
  peakWeekday: number | null;
  /** Crash hotspots the county has a traffic count for, ranked by crashes per
   *  vehicle. Empty when no hotspot road matched a count. */
  trafficAdjusted: TrafficAdjusted[];
};

const EMPTY: ScannerPatterns = {
  days: 0,
  total: 0,
  crashSpots: [],
  wireSpots: [],
  byHour: Array(24).fill(0),
  byKind: [],
  peakHour: null,
  byWeekday: Array(7).fill(0),
  peakWeekday: null,
  trafficAdjusted: [],
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday (0=Sun … 6=Sat) a UTC ms falls on in Eastern time. */
function etWeekday(ms: number): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(ms);
  return WEEKDAYS.indexOf(s);
}

const TRAFFIC = trafficCounts as Record<string, number>;
const ROAD_REPL: Record<string, string> = {
  ROAD: "RD", STREET: "ST", AVENUE: "AVE", DRIVE: "DR", HIGHWAY: "HWY",
  LANE: "LN", BOULEVARD: "BLVD", COURT: "CT", ROUTE: "RT",
};
/** Normalize a road name to the traffic-lookup key (same rules the bake used). */
export function roadKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/@.*$/, "")
    .replace(/\bBRIDGE\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ROAD_REPL[w] ?? w)
    .join(" ")
    .trim();
}

/**
 * Read the crash hotspots against county traffic counts: for each hotspot road
 * we have a count for, crashes per 1,000 vehicles/day. Ranked by that rate, so
 * a quieter road with the same crash load rises above a busy one. Intersections
 * are skipped (a corridor count doesn't describe a junction), and a road with
 * no county count simply doesn't appear — never a guessed volume.
 *
 * Below MIN_AADT the denominator is too small for a per-1,000 rate to mean
 * anything: those are culvert/pipe survey points and rural spurs (some as low
 * as 2 vehicles/day), where a single crash would mint a runaway rate and top
 * the card. We skip them rather than publish denominator noise as a hazard.
 */
const MIN_AADT = 500;
function trafficAdjusted(roads: { spot: string; count: number }[]): TrafficAdjusted[] {
  const out: TrafficAdjusted[] = [];
  for (const s of roads) {
    if (s.count < 2) continue; // a rate needs more than a single crash
    if (/\band\b/i.test(s.spot)) continue; // intersection, not a corridor
    const aadt = TRAFFIC[roadKey(s.spot)];
    if (!aadt || aadt < MIN_AADT) continue;
    out.push({ spot: s.spot, count: s.count, aadt, per1k: Math.round((s.count / (aadt / 1000)) * 10) / 10 });
  }
  out.sort((a, b) => b.per1k - a.per1k);
  return out.slice(0, 5);
}

/** Clock string like "7:23 pm" → hour of day 0–23, or null. */
export function hourOf(clock: string): number | null {
  const m = clock.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h;
}

/**
 * Collapse a block-level location to the SPOT crashes cluster on, or null when
 * it's too mangled to trust. An intersection stays whole ("Route 15 and Motter
 * Ave"); a block address drops its landmark tail and house-range number to the
 * road itself ("Coppermine Rd"), so repeated crashes up and down one road count
 * together. Highway tokens normalize ("Rt15sb" → "Route 15"), which also folds
 * both travel directions into one road. Ramp/mile-marker blurbs come through
 * garbled (a stray "block" mid-string) and are dropped rather than guessed.
 */
export function cleanSpot(location: string): string | null {
  let s = location.split(",")[0].trim(); // drop landmark / apt tail
  s = s.replace(/\s*\/\s*/g, " and "); // intersection slash → "and"
  s = s.replace(/\brt\s?(\d+)\s?(?:[nsew]b)?\b/gi, "Route $1"); // Rt15sb → Route 15
  s = s.replace(/\bi(\d{1,2})\s?(?:[nsew]b)?\b/gi, "I-$1"); // I70eb → I-70
  s = s.replace(/^\s*\d+\s*block\s*/i, ""); // drop leading house-range block
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/block/i.test(s)) return null; // mangled ramp/marker text
  if (s.length > 34) return null;
  return s;
}

function rank(map: Map<string, number>, min: number, limit: number): SpotCount[] {
  return [...map.entries()]
    .filter(([, count]) => count >= min)
    .map(([spot, count]) => ({ spot, count }))
    .sort((a, b) => b.count - a.count || a.spot.localeCompare(b.spot))
    .slice(0, limit);
}

/**
 * One public incident reduced to just what the pattern needs: its kind, the
 * road it maps to, the hour of day it happened (0–23, Eastern), and the
 * calendar day (for the distinct-day span). Whether it came from the page or
 * the archive, aggregation only ever sees this.
 */
export type PatternRecord = {
  kind: PublicIncidentKind;
  location: string;
  roadImpact: boolean;
  /** Dispatch time in ms — used when banking to the archive. */
  atMs: number | null;
  hour: number | null;
  dateKey: string;
};

const ET = "America/New_York";
/** Hour of day (0–23) a UTC ms falls on in Eastern time. */
function etHour(ms: number): number {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "2-digit", hour12: false }).format(ms),
    10,
  );
  return h % 24;
}
/** Eastern calendar day (YYYY-MM-DD) a UTC ms falls on. */
function etDateKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}
/** Eastern wall-clock ("07/20/2026" + "9:10 pm") → UTC ms. EDT/EST by month;
 *  a DST-boundary hour can be off by one, which the pattern view tolerates. */
function etWallToMs(dateMDY: string, clock: string): number | null {
  const dm = dateMDY.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const h = hourOf(clock);
  const min = clock.match(/:(\d{2})/);
  if (!dm || h === null || !min) return null;
  const month = parseInt(dm[1], 10);
  const offset = month >= 3 && month <= 11 ? "-04:00" : "-05:00";
  const iso = `${dm[3]}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}T${String(h).padStart(2, "0")}:${min[1]}:00${offset}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Read the public page's full rolling window into pattern records. */
export async function fetchPageRecords(): Promise<PatternRecord[]> {
  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const lines = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#?\w+;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

    const out: PatternRecord[] = [];
    for (const line of lines) {
      const inc = publicIncident(line);
      if (!inc) continue; // same allowlist as the live board
      const dm = line.match(/posted\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      const atMs = dm ? etWallToMs(dm[1], inc.time) : null;
      out.push({
        kind: inc.kind,
        location: inc.location,
        roadImpact: inc.roadImpact,
        atMs,
        hour: hourOf(inc.time),
        // Same YYYY-MM-DD key the archive uses, so distinct-day counts line up.
        dateKey: atMs !== null ? etDateKey(atMs) : "",
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Read the banked archive (empty when the DB is dormant / not migrated). */
async function fetchArchiveRecords(): Promise<PatternRecord[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const since = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        kind: scanner_incidents.kind,
        location: scanner_incidents.location,
        road_impact: scanner_incidents.road_impact,
        occurred_at: scanner_incidents.occurred_at,
      })
      .from(scanner_incidents)
      .where(gte(scanner_incidents.occurred_at, since));
    return rows.map((r) => {
      const ms = r.occurred_at instanceof Date ? r.occurred_at.getTime() : Date.parse(String(r.occurred_at));
      return {
        kind: r.kind as PublicIncidentKind,
        location: r.location,
        roadImpact: r.road_impact,
        atMs: ms,
        hour: Number.isFinite(ms) ? etHour(ms) : null,
        dateKey: Number.isFinite(ms) ? etDateKey(ms) : "",
      };
    });
  } catch {
    return []; // table missing / transient — fall back to the page
  }
}

/** Reduce a set of records to the patterns the page renders. */
function aggregateRecords(records: PatternRecord[]): ScannerPatterns {
  const days = new Set<string>();
  const crashes = new Map<string, number>();
  const wires = new Map<string, number>();
  const kinds = new Map<PublicIncidentKind, number>();
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  let total = 0;

  for (const r of records) {
    total += 1;
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
    if (r.dateKey) days.add(r.dateKey);
    if (r.kind === "Crash") {
      const spot = cleanSpot(r.location);
      if (spot) crashes.set(spot, (crashes.get(spot) ?? 0) + 1);
      if (r.hour !== null) byHour[r.hour] += 1;
      if (r.atMs !== null && Number.isFinite(r.atMs)) {
        const wd = etWeekday(r.atMs);
        if (wd >= 0) byWeekday[wd] += 1;
      }
    } else if (r.kind === "Wires down") {
      const spot = cleanSpot(r.location);
      if (spot) wires.set(spot, (wires.get(spot) ?? 0) + 1);
    }
  }

  if (total === 0) return EMPTY;

  const peak = byHour.reduce((best, c, h) => (c > byHour[best] ? h : best), 0);
  const peakWd = byWeekday.reduce((best, c, d) => (c > byWeekday[best] ? d : best), 0);
  const byKind = [...kinds.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);

  return {
    days: days.size,
    total,
    crashSpots: rank(crashes, 2, 6),
    wireSpots: rank(wires, 2, 4),
    byHour,
    byKind,
    peakHour: byHour[peak] > 0 ? peak : null,
    byWeekday,
    peakWeekday: byWeekday[peakWd] > 0 ? peakWd : null,
    // Computed over EVERY crash road (not just the top-6 shown), so a quieter
    // road with a bad crash-per-vehicle rate can surface even when it isn't a
    // top hotspot by raw count.
    trafficAdjusted: trafficAdjusted([...crashes.entries()].map(([spot, count]) => ({ spot, count }))),
  };
}

/**
 * Place each spot on the map via the shared county-gated geocoder (30-day
 * cached, so recurring roads cost nothing after the first hit). A spot that
 * can't be resolved simply keeps no coordinate and renders as plain text —
 * never a wrong pin.
 */
async function geocodeSpots(spots: SpotCount[]): Promise<SpotCount[]> {
  return Promise.all(
    spots.map(async (s) => {
      const coord = await geocodeAddressInCounty(s.spot).catch(() => null);
      return coord ? { ...s, lat: coord.lat, lng: coord.lng } : s;
    }),
  );
}

async function fetchScannerPatterns(): Promise<ScannerPatterns> {
  // Prefer the archive — it's the only source that grows past the page's ~3
  // weeks. The backfill keeps it a superset of the page, so this isn't a union
  // (no double-count); the page is purely the bootstrap/fallback.
  const archive = await fetchArchiveRecords();
  const patterns = aggregateRecords(archive.length > 0 ? archive : await fetchPageRecords());

  // Give the hotspots coordinates so each one can open on the map.
  const [crashSpots, wireSpots] = await Promise.all([
    geocodeSpots(patterns.crashSpots),
    geocodeSpots(patterns.wireSpots),
  ]);
  return { ...patterns, crashSpots, wireSpots };
}

/** Public scanner patterns, cached hourly. Empty and honest when unreachable. */
export const getScannerPatterns = unstable_cache(
  fetchScannerPatterns,
  // v2: shape gained trafficAdjusted + byWeekday/peakWeekday. v3: dropped 85
  // survey-year-as-AADT entries from traffic-counts.json and floored AADT at
  // MIN_AADT, so the hotspot rates change — bump the key so a durable cache
  // can't serve the old, inflated hotspots across deploys (PR #509 lesson).
  ["scanner-patterns-v3"],
  { revalidate: 3600, tags: ["scanner-patterns"] },
);
