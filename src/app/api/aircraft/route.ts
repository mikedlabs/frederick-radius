import { NextResponse } from "next/server";

/**
 * Live aircraft over Frederick — a thin, cached proxy over the free
 * airplanes.live ADS-B feed (no key; community data). Server-side so there's
 * no CORS, the upstream is hit politely (a short in-memory cache shared across
 * requests), and the client only ever sees a slim, normalized shape.
 *
 * Honest by construction: ADS-B only shows aircraft that transmit, so small
 * GA planes and anything not equipped won't appear — the UI says so. We never
 * invent a track; everything here is the transponder's own report.
 */

export const dynamic = "force-dynamic";

// Frederick, MD (downtown). Radius in nm — wide enough to catch the DC/BWI
// arrival/departure streams + the FDK pattern, without pulling the whole
// Northeast corridor.
const LAT = 39.4143;
const LON = -77.4105;
const RADIUS_NM = 60;
const SOURCE = `https://api.airplanes.live/v2/point/${LAT}/${LON}/${RADIUS_NM}`;
const FALLBACK = `https://opendata.adsb.fi/api/v2/lat/${LAT}/lon/${LON}/dist/${RADIUS_NM}`;

/** A resolved airport endpoint of a flight's route. */
export type AirportRef = { iata: string; name: string };
/** Where a flight is coming from + going, when the callsign has a known route. */
export type Route = { from: AirportRef | null; to: AirportRef | null };

export type Aircraft = {
  hex: string;
  /** Trimmed callsign, e.g. "UAL1234" (or null when not transmitted). */
  flight: string | null;
  /** ICAO type code, e.g. "A320". */
  type: string | null;
  /** Human description, e.g. "Airbus A320". */
  desc: string | null;
  /** Barometric altitude in feet (number); null when on the ground/unknown. */
  alt: number | null;
  /** Ground speed, knots (the raw transponder unit; the UI shows mph). */
  gs: number | null;
  /** True track over ground, degrees (0 = N, clockwise). */
  track: number | null;
  lat: number;
  lon: number;
  /** Distance from Frederick, nautical miles. */
  dst: number | null;
  /** Bearing from Frederick, degrees (0 = N, clockwise). */
  dir: number | null;
  /** ADS-B emergency/special squawk state ("none" when normal). */
  emergency: string | null;
  /** Origin → destination, resolved from the callsign via hexdb (null when the
   *  flight has no published route, e.g. most private/GA traffic). */
  route?: Route | null;
};

type RawAc = {
  hex?: string; flight?: string; t?: string; desc?: string;
  alt_baro?: number | "ground"; gs?: number; track?: number;
  lat?: number; lon?: number; dst?: number; dir?: number; emergency?: string;
};

let cache: { at: number; data: Aircraft[] } | null = null;
const TTL_MS = 12_000;

function normalize(raw: RawAc[]): Aircraft[] {
  return raw
    .filter((a) => typeof a.lat === "number" && typeof a.lon === "number")
    // "What's flying" — drop anything the transponder reports as on the ground
    // (taxiing, parked, airport ground vehicles), not overhead traffic.
    .filter((a) => a.alt_baro !== "ground")
    .map((a) => ({
      hex: a.hex ?? "",
      flight: a.flight?.trim() || null,
      type: a.t ?? null,
      desc: a.desc ?? null,
      alt: typeof a.alt_baro === "number" ? a.alt_baro : null,
      gs: typeof a.gs === "number" ? Math.round(a.gs) : null,
      track: typeof a.track === "number" ? a.track : null,
      lat: a.lat as number,
      lon: a.lon as number,
      dst: typeof a.dst === "number" ? a.dst : null,
      dir: typeof a.dir === "number" ? a.dir : null,
      emergency: a.emergency && a.emergency !== "none" ? a.emergency : null,
    }))
    // Nearest first; cap so a busy corridor can't bloat the payload.
    .sort((x, y) => (x.dst ?? 999) - (y.dst ?? 999))
    .slice(0, 80);
}

// ── Route enrichment (hexdb.io) ──────────────────────────────────────────
// ADS-B carries no origin/destination; hexdb maps a callsign → "KORIG-KDEST"
// and an ICAO → airport name. Both are stable, so we cache hard: routes for a
// few hours, airports indefinitely (they don't move). Bounded to the nearest
// few callsigned flights per refresh, fail-soft (a flight just shows no route).
const HEXDB = "https://hexdb.io/api/v1";
const routeCache = new Map<string, { at: number; v: { orig: string; dest: string } | null }>();
const ROUTE_TTL_MS = 6 * 3_600_000;
const airportCache = new Map<string, AirportRef | null>();

async function hexdb(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${HEXDB}/${path}`, {
      headers: { "User-Agent": "frederick-radius (overhead radar; non-commercial)" },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function lookupRoute(callsign: string): Promise<{ orig: string; dest: string } | null> {
  const k = callsign.toUpperCase();
  const hit = routeCache.get(k);
  if (hit && Date.now() - hit.at < ROUTE_TTL_MS) return hit.v;
  const d = await hexdb(`route/icao/${encodeURIComponent(k)}`);
  const route = typeof d?.route === "string" ? d.route : "";
  let v: { orig: string; dest: string } | null = null;
  // hexdb gives "KORIG-KDEST"; multi-leg routes are dash-joined, take the ends.
  const parts = route.split("-").filter(Boolean);
  if (parts.length >= 2) v = { orig: parts[0], dest: parts[parts.length - 1] };
  routeCache.set(k, { at: Date.now(), v });
  return v;
}

async function lookupAirport(icao: string): Promise<AirportRef | null> {
  if (airportCache.has(icao)) return airportCache.get(icao)!;
  const d = await hexdb(`airport/icao/${encodeURIComponent(icao)}`);
  const iata = typeof d?.iata === "string" && d.iata ? d.iata : icao;
  const name = typeof d?.airport === "string" && d.airport ? d.airport : icao;
  const v: AirportRef | null = d ? { iata, name } : null;
  airportCache.set(icao, v);
  return v;
}

// Enrich the nearest callsigned flights with their route. Whole-batch budget so
// a slow/down hexdb never holds the aircraft response hostage; late-resolving
// routes still land on the cached objects for the next read in the TTL window.
async function enrichRoutes(list: Aircraft[]): Promise<void> {
  // Airline callsigns (3 letters + digits, e.g. AAL1609) carry published routes;
  // GA registrations (N-numbers) don't, so spend the budget on the airliners
  // first — near Frederick the NEAREST traffic is mostly GA, while the routed
  // airliners ride the higher DC/BWI streams further out.
  const isAirline = (cs: string) => /^[A-Z]{3}\d/.test(cs);
  const targets = list
    .filter((a) => a.flight)
    .sort((a, b) => (isAirline(b.flight!) ? 1 : 0) - (isAirline(a.flight!) ? 1 : 0))
    .slice(0, 14);
  const work = Promise.allSettled(
    targets.map(async (a) => {
      const r = await lookupRoute(a.flight!);
      if (!r) { a.route = null; return; }
      const [from, to] = await Promise.all([lookupAirport(r.orig), lookupAirport(r.dest)]);
      a.route = { from, to };
    }),
  );
  await Promise.race([work, new Promise<void>((res) => setTimeout(res, 4500))]);
}

async function fetchFrom(url: string): Promise<Aircraft[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "frederick-radius (overhead radar; non-commercial)" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const json = (await res.json()) as { ac?: RawAc[]; aircraft?: RawAc[] };
  return normalize(json.ac ?? json.aircraft ?? []);
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json({ aircraft: cache.data, at: cache.at, source: "airplanes.live" });
  }
  try {
    let data: Aircraft[];
    try {
      data = await fetchFrom(SOURCE);
    } catch {
      data = await fetchFrom(FALLBACK);
    }
    await enrichRoutes(data);
    cache = { at: now, data };
    return NextResponse.json({ aircraft: data, at: now, source: "airplanes.live" });
  } catch {
    // Serve the last good snapshot if we have one; otherwise an honest empty.
    if (cache) return NextResponse.json({ aircraft: cache.data, at: cache.at, source: "airplanes.live", stale: true });
    return NextResponse.json({ aircraft: [], at: now, source: "airplanes.live", error: true }, { status: 200 });
  }
}
