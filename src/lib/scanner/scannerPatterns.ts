/**
 * What the public wire shows OVER TIME — the honest use of old calls.
 *
 * The live board answers "what's happening now"; this answers "where and when
 * things happen around here." We read frederickscanner.com's public page (it
 * carries a rolling ~3 weeks, not just the last hour), run every line through
 * the SAME public-only allowlist as the live feed, and aggregate:
 *
 *   - crash hotspots     — the roads/intersections crashes keep clustering on
 *   - storm corridors    — where wires come down
 *   - the daily rhythm    — crashes by hour of day
 *
 * Everything here is aggregate, public, block-level road data (never a medical
 * or personal call — those are dropped upstream, exactly as on the live board).
 * No individual old call is surfaced; only the pattern. Cached hourly because
 * it parses the whole page and the shape barely moves minute to minute.
 */
import { unstable_cache } from "next/cache";
import { publicIncident, type PublicIncidentKind } from "@/lib/scanner/incidentFeed";

const SOURCE_URL = "https://frederickscanner.com/fredscannerpro/tweets.html";

export type SpotCount = { spot: string; count: number };
export type KindCount = { kind: PublicIncidentKind; count: number };

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
};

const EMPTY: ScannerPatterns = {
  days: 0,
  total: 0,
  crashSpots: [],
  wireSpots: [],
  byHour: Array(24).fill(0),
  byKind: [],
  peakHour: null,
};

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

async function fetchScannerPatterns(): Promise<ScannerPatterns> {
  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return EMPTY;
    const html = await res.text();
    const lines = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#?\w+;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

    const days = new Set<string>();
    const crashes = new Map<string, number>();
    const wires = new Map<string, number>();
    const kinds = new Map<PublicIncidentKind, number>();
    const byHour = Array(24).fill(0);
    let total = 0;

    for (const line of lines) {
      const inc = publicIncident(line);
      if (!inc) continue; // same allowlist as the live board
      total += 1;
      kinds.set(inc.kind, (kinds.get(inc.kind) ?? 0) + 1);

      const dm = line.match(/posted\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (dm) days.add(dm[1]);

      if (inc.kind === "Crash") {
        const spot = cleanSpot(inc.location);
        if (spot) crashes.set(spot, (crashes.get(spot) ?? 0) + 1);
        const h = hourOf(inc.time);
        if (h !== null) byHour[h] += 1;
      } else if (inc.kind === "Wires down") {
        const spot = cleanSpot(inc.location);
        if (spot) wires.set(spot, (wires.get(spot) ?? 0) + 1);
      }
    }

    if (total === 0) return EMPTY;

    const peak = byHour.reduce((best, c, h) => (c > byHour[best] ? h : best), 0);
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
    };
  } catch {
    return EMPTY;
  }
}

/** Public scanner patterns, cached hourly. Empty and honest when unreachable. */
export const getScannerPatterns = unstable_cache(
  fetchScannerPatterns,
  ["scanner-patterns-v1"],
  { revalidate: 3600, tags: ["scanner-patterns"] },
);
