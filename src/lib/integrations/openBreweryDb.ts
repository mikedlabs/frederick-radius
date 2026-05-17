/**
 * Open Brewery DB — free, no API key, public brewery data.
 * https://api.openbrewerydb.org
 *
 * First step of the brewery-coverage work, built as a per-domain
 * ingestion module (the sanctioned "authority + spine" pattern): the
 * pure normalizer is the real logic and is unit-tested; the network
 * fetch runs in cron/CI (the sandbox cannot reach external feeds).
 *
 * This module is a SOURCE at the integration boundary. It deliberately
 * does NOT touch the static Place type or the compose graph. Surfacing
 * (cron -> store -> dedupe-merge through the existing spine) is the
 * next step, gated on the data-path decision, so this stays additive
 * and zero-blast-radius. Off unless RADIUS_OBDB=1 (default === today).
 */

const OBDB_BASE = "https://api.openbrewerydb.org/v1";

/** Raw record shape from the Open Brewery DB v1 API (fields we use). */
export type ObdbRaw = {
  id: string;
  name: string;
  brewery_type: string;
  address_1?: string | null;
  city?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  longitude?: string | number | null;
  latitude?: string | number | null;
  phone?: string | null;
  website_url?: string | null;
};

/** Normalized brewery at the source boundary (Place-compatible-ish). */
export type BreweryRecord = {
  externalId: string;
  name: string;
  /** OBDB type kept for editorial nuance (micro, brewpub, regional…). */
  breweryType: string;
  address: string;
  city: string;
  municipality: string;
  state: "MD";
  postalCode: string;
  geom: { lat: number; lng: number };
  phone?: string;
  website?: string;
  source: "openbrewerydb";
  /** Normalized name for deduping against curated/DFP at merge time. */
  dedupeKey: string;
};

// Frederick County municipalities. An OBDB row whose city is not one of
// these is rejected rather than guessed at — no fabricated municipality
// (consistent with the project's no-fabrication data principle).
const CITY_TO_MUNI: Record<string, string> = {
  frederick: "frederick",
  brunswick: "brunswick",
  thurmont: "thurmont",
  middletown: "middletown",
  "mount airy": "mount-airy",
  "mt airy": "mount-airy",
  "mt. airy": "mount-airy",
  walkersville: "walkersville",
  emmitsburg: "emmitsburg",
  "new market": "new-market",
  myersville: "myersville",
  woodsboro: "woodsboro",
  burkittsville: "burkittsville",
  jefferson: "frederick",
  ijamsville: "frederick",
  adamstown: "frederick",
  knoxville: "brunswick",
};

// brewery_type values that must NOT surface as an open place.
const EXCLUDED_TYPES = new Set(["closed", "planning", "in planning"]);

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Raw OBDB record -> our brewery record, or null when it should not
 * surface: outside Maryland / Frederick County, closed/planning, or
 * missing coordinates. Pure and deterministic — the unit-tested core.
 */
export function normalizeBrewery(raw: ObdbRaw): BreweryRecord | null {
  if (!raw?.id || !raw.name?.trim()) return null;

  const state = (raw.state_province ?? "").trim().toLowerCase();
  if (state !== "maryland" && state !== "md") return null;

  if (EXCLUDED_TYPES.has((raw.brewery_type ?? "").trim().toLowerCase())) return null;

  const cityRaw = (raw.city ?? "").trim();
  const muni = CITY_TO_MUNI[cityRaw.toLowerCase()];
  if (!muni) return null; // not a Frederick County municipality

  const lat = num(raw.latitude);
  const lng = num(raw.longitude);
  if (lat === null || lng === null) return null;
  // Frederick County is roughly 39.2–39.8 N, -77.7– -77.0 W. A coord
  // far outside that means a bad row, not a Frederick brewery.
  if (lat < 39.0 || lat > 40.0 || lng < -78.0 || lng > -76.7) return null;

  const name = raw.name.trim();
  return {
    externalId: raw.id,
    name,
    breweryType: (raw.brewery_type ?? "").trim() || "brewery",
    address: (raw.address_1 ?? "").trim(),
    city: cityRaw,
    municipality: muni,
    state: "MD",
    postalCode: (raw.postal_code ?? "").trim(),
    geom: { lat, lng },
    phone: raw.phone?.trim() || undefined,
    website: raw.website_url?.trim() || undefined,
    source: "openbrewerydb",
    dedupeKey: normName(name),
  };
}

async function obdbFetch(params: Record<string, string>, revalidate = 86_400): Promise<ObdbRaw[]> {
  const url = new URL(`${OBDB_BASE}/breweries`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate } });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as ObdbRaw[]) : [];
  } catch {
    return [];
  }
}

/**
 * Frederick County breweries from Open Brewery DB, normalized and
 * de-duped by name. Off (returns []) unless RADIUS_OBDB=1, so the
 * default is exactly today's behavior. Network runs in cron/CI.
 */
export async function fetchFrederickBreweries(): Promise<BreweryRecord[]> {
  if (process.env.RADIUS_OBDB !== "1") return [];
  const raw = await obdbFetch({ by_state: "maryland", per_page: "200" });
  const seen = new Set<string>();
  const out: BreweryRecord[] = [];
  for (const r of raw) {
    const b = normalizeBrewery(r);
    if (!b || seen.has(b.dedupeKey)) continue;
    seen.add(b.dedupeKey);
    out.push(b);
  }
  return out;
}
