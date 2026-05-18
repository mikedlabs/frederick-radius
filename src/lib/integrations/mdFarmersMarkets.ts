/**
 * Maryland official farmers-markets — schedule enrichment for /markets.
 *
 * The /markets page is a keyless heuristic over our curated places
 * (isFarmersMarket by name) and has NO market day / hours. Maryland
 * publishes the official market list as a keyless Socrata dataset
 * (fpk6-yugb) WITH a real county column, market_day, market_hours,
 * address, and website. This does NOT add a page or a Today card — it
 * ENRICHES the existing /markets cards with the real schedule, joined
 * by exact normalized name (the same conservative pattern as the
 * Park_Locations enrichment).
 *
 * HONEST SOURCING (confirmed live against the dataset, 2026-05):
 *  - 9 Frederick County rows via $where=farmers_market_county.
 *  - market_day / market_hours / address / website are stable and
 *    surfaced. market_start_date / market_end_date are STALE in the
 *    source (2017-2018 values) so the season is deliberately NOT
 *    shown — a stale year would mislead. A market's recurring day and
 *    time, by contrast, rarely change.
 *  - Empty cells arrive as the literal string "None"; treated as
 *    missing, never shown.
 */

const ENDPOINT =
  "https://opendata.maryland.gov/resource/fpk6-yugb.json" +
  "?$select=market_name,market_day,market_hours,full_market_address,website,federal_benefits" +
  "&$where=farmers_market_county='Frederick'&$limit=200";
const TIMEOUT_MS = 15_000;

export type MdMarket = {
  name: string;
  /** Exact-match key: uppercase, alphanumeric only. */
  norm: string;
  day?: string;
  hours?: string;
  address?: string;
  website?: string;
  benefits?: string;
};

const JUNK = new Set(["", "NONE", "N/A", "NA", "NULL", "TBD", "UNKNOWN"]);

function clean(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || JUNK.has(s.toUpperCase())) return undefined;
  return s;
}
/** Accept http(s) as-is; prefix a bare www./domain; else drop. */
function webUrl(v: unknown): string | undefined {
  const s = clean(v);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\.[^\s]+\.[^\s]+$/i.test(s)) return `https://${s}`;
  return undefined;
}
/** Exact-match key, pure + exported so the join is unit-tested. */
export function normMarketName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}
/** Symmetric strip of trailing MARKET/FARMERSMARKET so e.g.
 *  "West Frederick Farmers Market" can still match "West Frederick". */
function strip(norm: string): string {
  let s = norm;
  for (const suf of ["FARMERSMARKET", "FARMMARKET", "MARKET"]) {
    if (s.endsWith(suf) && s.length - suf.length >= 4) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

/**
 * Pure: Socrata JSON rows → MdMarket[]. Drops nameless rows, treats
 * "None" as missing, dedupes by normalized name. Exported for unit
 * tests without the live endpoint.
 */
export function normalizeMdMarkets(raw: unknown): MdMarket[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MdMarket[] = [];
  for (const row of raw as Array<Record<string, unknown>>) {
    const name = clean(row.market_name);
    if (!name) continue;
    const norm = normMarketName(name);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      name,
      norm,
      day: clean(row.market_day),
      hours: clean(row.market_hours),
      address: clean(row.full_market_address),
      website: webUrl(row.website),
      benefits: clean(row.federal_benefits),
    });
  }
  return out;
}

/**
 * Pure, conservative: the official market whose name matches `name`
 * EXACTLY after normalization (full key first, then a symmetric
 * trailing-"MARKET" strip). Never fuzzy containment. Exported +
 * unit-tested. Returns undefined when there is no confident match.
 */
export function findMarketSchedule(
  name: string,
  markets: MdMarket[],
): MdMarket | undefined {
  if (markets.length === 0) return undefined;
  const norm = normMarketName(name);
  const exact = markets.find((m) => m.norm === norm);
  if (exact) return exact;
  // Fallback: both sides stripped of a trailing MARKET/FARMERSMARKET,
  // compared for EQUALITY only (never containment), length-guarded so
  // a short stem can't collide.
  const st = strip(norm);
  if (st.length < 4) return undefined;
  return markets.find((m) => strip(m.norm) === st);
}

export async function getFrederickMdMarkets(): Promise<MdMarket[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // Market day/hours change rarely; weekly is plenty.
      next: { revalidate: 604800 },
    });
    if (!res.ok) return [];
    return normalizeMdMarkets(await res.json());
  } catch {
    return []; // network/feed hiccup — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}
