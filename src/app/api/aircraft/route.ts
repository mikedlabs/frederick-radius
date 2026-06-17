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
  /** Ground speed, knots. */
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
    cache = { at: now, data };
    return NextResponse.json({ aircraft: data, at: now, source: "airplanes.live" });
  } catch {
    // Serve the last good snapshot if we have one; otherwise an honest empty.
    if (cache) return NextResponse.json({ aircraft: cache.data, at: cache.at, source: "airplanes.live", stale: true });
    return NextResponse.json({ aircraft: [], at: now, source: "airplanes.live", error: true }, { status: 200 });
  }
}
