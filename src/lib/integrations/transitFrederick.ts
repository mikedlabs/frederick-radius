/**
 * TransIT Frederick — public transit routes + stops.
 *
 * HONEST SOURCING: this module serves Maryland Open Data route lines and
 * stop points. The separate, confirmed TransIT static GTFS snapshot lives in
 * src/data/transit.json, while GTFS-realtime vehicle and TripUpdates feeds are
 * handled by transitRealtime.ts. Do not describe this weekly Socrata geometry
 * as live vehicle or arrival data.
 *
 * What IS reliable + keyless today on Maryland Open Data (Socrata):
 *   - "Frederick County TransIT Routes" (2xca-jw6k) — 36 routes with
 *     LineString geometry
 *   - "Frederick County TransIT Stops" (4zcx-89nc) — 350 named stops
 *     with point geometry
 *
 * Runtime integration, the overpass/trails pattern: server fetch,
 * weekly revalidate, graceful [] on any failure, no key, nothing
 * fabricated. Each dataset has a freshness probe so the UI can tell
 * the user when the data was last updated upstream — Proposal D's
 * "data freshness gate" rule: never present stale transit as live.
 */
const ROUTES_ENDPOINT =
  "https://opendata.maryland.gov/resource/2xca-jw6k.geojson?$limit=500";
const STOPS_ENDPOINT =
  "https://opendata.maryland.gov/resource/4zcx-89nc.geojson?$limit=500";
// Socrata view metadata — used for the freshness probe. Returns a
// `rowsUpdatedAt` unix timestamp that tells us when the dataset was
// last refreshed upstream.
const STOPS_META = "https://opendata.maryland.gov/api/views/4zcx-89nc";
const ROUTES_META = "https://opendata.maryland.gov/api/views/2xca-jw6k";
const TIMEOUT_MS = 15_000;
// Same as ENDPOINT but kept under the old name so the rest of the
// module's history is readable. New code should reach for ROUTES_ENDPOINT.
const ENDPOINT = ROUTES_ENDPOINT;
// Frederick County bbox [south, west, north, east].
const BBOX: [number, number, number, number] = [39.265, -77.7, 39.745, -77.15];

export type TransitRoute = {
  id: string;
  name: string;
  destination?: string;
  variation?: string;
  /** Representative point (first vertex) for a map-focus link. */
  lng: number;
  lat: number;
};

type Feature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function pick(p: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

// First vertex of a LineString or MultiLineString (any nesting) —
// enough for a map-focus point. Descends into first elements until a
// [number, number] pair.
function firstVertex(coords: unknown): [number, number] | null {
  let c: unknown = coords;
  for (let depth = 0; depth < 6; depth++) {
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      return [c[0], c[1]];
    }
    if (Array.isArray(c) && c.length > 0) {
      c = c[0];
      continue;
    }
    return null;
  }
  return null;
}

/**
 * Canonical TransIT route names by the feed's `route_id`, verified against
 * the county's own route list (transit.json snapshot, 2026-06). The July
 * 2026 Socrata schema dropped the `route_name` column in favor of
 * `rt_long_nm` ("#65 route alternate segment 1"), which is segment-level
 * and ugly for display; the id → canonical-name map restores the county's
 * real route names and lets the page's group-by-name collapse segments
 * back into their route.
 */
const CANONICAL_ROUTE_NAMES: Record<string, string> = {
  "10": "10 Connector",
  "15": "15 Connector",
  "20": "20 Connector",
  "40": "40 Connector",
  "50": "50 Connector",
  "51": "51 Connector",
  "60": "60 Connector",
  "61": "61 Connector",
  "65": "65 Connector",
  "80": "80 Connector",
  "85": "Route 85 Shuttle",
  BJS: "Brunswick Jefferson Shuttle",
  EFS: "East Frederick Shuttle",
  ETS: "Emmitsburg Thurmont Shuttle",
  NFS: "North Frederick Shuttle",
};

/**
 * Route name under the 2026 schema. One quirk: route_id "MTM" covers TWO
 * distinct shuttles (Point of Rocks and Walkersville Meet-the-MARC), so
 * those disambiguate on the long name BEFORE the id map. Unknown ids fall
 * back to the long name with the segment suffix stripped.
 */
function canonicalRouteName(p: Record<string, unknown>): string | undefined {
  const long = pick(p, "rt_long_nm", "rt_long_name");
  if (long && /meet-the-marc/i.test(long)) {
    if (/walkersville/i.test(long)) return "Walkersville Meet-the-MARC Shuttle";
    if (/point of rocks/i.test(long)) return "Point of Rocks Meet-the-MARC Shuttle";
  }
  const id = pick(p, "route_id", "Route ID");
  if (id && CANONICAL_ROUTE_NAMES[id]) return CANONICAL_ROUTE_NAMES[id];
  if (!long) return undefined;
  const base = long
    .replace(/\s*(?:route\s+)?(?:alternate\s+segment|alt\s+seg|segment)\s*\d*\s*$/i, "")
    .replace(/^#/, "")
    .trim();
  return base || undefined;
}

/**
 * Pure: Socrata GeoJSON FeatureCollection → TransitRoute[]. Drops
 * nameless / geometry-less / out-of-county. Exported for unit tests
 * (no network). Defensive about Socrata's column casing, and handles
 * both the pre-2026 schema (route_name) and the 2026 one (rt_long_nm).
 */
export function normalizeTransitRoutes(raw: unknown): TransitRoute[] {
  const feats = (raw as { features?: Feature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  const out: TransitRoute[] = [];
  for (const f of feats) {
    const p = f?.properties ?? {};
    const name = pick(p, "route_name", "Route Name", "routename") ?? canonicalRouteName(p);
    if (!name) continue;
    const pt = firstVertex(f?.geometry?.coordinates);
    if (!pt) continue;
    const [lng, lat] = pt;
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const id = pick(p, "route_id", "Route ID", "gis_object_id") ?? name;
    const variation = pick(p, "variation", "Variation");
    // Segment-level rows share route_id (and often variation) under the
    // 2026 schema — key on the long name too so segments survive as
    // distinct variations instead of being deduped away.
    const key = `${id}|${variation ?? ""}|${pick(p, "rt_long_nm", "rt_long_name") ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(id),
      name,
      destination: pick(p, "destination", "Destination"),
      variation,
      lng,
      lat,
    });
  }
  return out;
}

export async function getFrederickTransitRoutes(): Promise<TransitRoute[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604800 }, // routes change rarely
    });
    if (!res.ok) return [];
    return normalizeTransitRoutes(await res.json());
  } catch {
    return []; // network/feed hiccup — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}

// ── #3 phase 1: geometry-preserving accessor (foundation for the
// map layer manager). Additive — does not touch the point accessor
// above or any rendering. Returns a plain GeoJSON FeatureCollection
// of route lines with light props; pure normalizer is unit-tested.
export type LineFC = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: unknown; properties: Record<string, unknown> }>;
};

import { slimGeometryFC } from "@/lib/geo/slim-geometry";

export function transitRouteShapesFC(raw: unknown): LineFC {
  const feats = (raw as { features?: Feature[] })?.features;
  const out: LineFC["features"] = [];
  if (Array.isArray(feats)) {
    for (const f of feats) {
      const g = f?.geometry;
      const t = g?.type;
      if (t !== "LineString" && t !== "MultiLineString") continue;
      const pt = firstVertex(g?.coordinates);
      if (!pt) continue;
      const [lng, lat] = pt;
      const [s, w, n, e] = BBOX;
      if (lat < s || lat > n || lng < w || lng > e) continue;
      const p = f.properties ?? {};
      out.push({
        type: "Feature",
        geometry: g,
        properties: {
          name: pick(p, "route_name", "Route Name", "routename") ?? "Route",
          destination: pick(p, "destination", "Destination") ?? "",
        },
      });
    }
  }
  return { type: "FeatureCollection", features: out };
}

export async function getFrederickTransitRouteShapes(): Promise<LineFC> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (!res.ok) return { type: "FeatureCollection", features: [] };
    // Display-slimming (payload audit 2026-07-02: raw route shapes were
    // 247 KB of /map HTML). 5 decimals ≈ 1.1 m; 0.00008° ≈ 9 m — routes
    // follow roads users zoom into, so the tolerance stays tighter than
    // the boundary overlays'. Applied here, not in the pure normalizer.
    return slimGeometryFC(transitRouteShapesFC(await res.json()), { decimals: 5, tolerance: 0.00008 });
  } catch {
    return { type: "FeatureCollection", features: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ── Stops (#3 phase 2 — Proposal D: data freshness gate) ──────────
//
// 350 real Frederick County TransIT stops with point geometry + name,
// served by Maryland Open Data (Socrata id 4zcx-89nc). Same loader
// pattern as routes: server fetch, weekly revalidate, graceful empty
// on any failure, no fabrication.
//
// Why a freshness probe?
//   The full "next departure" experience requires a live GTFS feed,
//   which the county has not yet published. Stops alone are useful
//   ("where do I catch the bus") but ONLY if the user knows whether
//   the list is current. Socrata exposes a `rowsUpdatedAt` timestamp
//   per dataset; we surface it as a human-readable "Updated X ago"
//   on /transit so the user can judge freshness themselves. If the
//   metadata fetch fails we degrade silently — we don't pretend it
//   was just updated.

export type TransitStop = {
  id: string;
  name: string;
  lng: number;
  lat: number;
};

/**
 * Pure: Socrata GeoJSON FeatureCollection → TransitStop[]. Same bbox +
 * dedup + defensive shape-handling as the routes normalizer. Exported
 * for unit tests (no network).
 */
export function normalizeTransitStops(raw: unknown): TransitStop[] {
  const feats = (raw as { features?: Feature[] })?.features;
  if (!Array.isArray(feats)) return [];
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  const out: TransitStop[] = [];
  for (const f of feats) {
    const g = f?.geometry;
    if (g?.type !== "Point") continue;
    const coords = g.coordinates;
    if (
      !Array.isArray(coords) ||
      typeof coords[0] !== "number" ||
      typeof coords[1] !== "number"
    ) {
      continue;
    }
    const lng = coords[0];
    const lat = coords[1];
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const p = f?.properties ?? {};
    const name = pick(p, "stop_name", "Stop Name", "stopname");
    if (!name) continue;
    const id = pick(p, "objectid", "stop_id", "Stop ID") ?? `${lng},${lat}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, lng, lat });
  }
  return out;
}

export async function getFrederickTransitStops(): Promise<TransitStop[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(STOPS_ENDPOINT, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 604_800 }, // stops change rarely
    });
    if (!res.ok) return [];
    return normalizeTransitStops(await res.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Freshness probe ───────────────────────────────────────────────
//
// Returns the upstream "last updated" wall-clock time for each
// dataset. UI consumers can show "Updated 3 months ago" so users can
// judge whether the list is still current. Null on any failure —
// the page MUST NOT claim a freshness it can't prove.

export type TransitFreshness = {
  /** ISO timestamp of the most recent upstream refresh, or null. */
  routesUpdatedAt: string | null;
  stopsUpdatedAt: string | null;
};

async function fetchSocrataUpdatedAt(metaUrl: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(metaUrl, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 86_400 }, // probe at most daily
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { rowsUpdatedAt?: number };
    const ts = d?.rowsUpdatedAt;
    if (!ts || typeof ts !== "number" || ts < 1_000_000_000) return null;
    return new Date(ts * 1000).toISOString();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getTransitFreshness(): Promise<TransitFreshness> {
  const [routesUpdatedAt, stopsUpdatedAt] = await Promise.all([
    fetchSocrataUpdatedAt(ROUTES_META),
    fetchSocrataUpdatedAt(STOPS_META),
  ]);
  return { routesUpdatedAt, stopsUpdatedAt };
}
