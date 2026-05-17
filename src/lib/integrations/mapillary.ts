/**
 * Mapillary street-level object detections → trash-can points.
 *
 * Why this exists: the owner wanted "use street imagery to find the
 * trash cans." Google Street View's terms forbid automated extraction
 * of its imagery to derive a dataset, so that path is off the table.
 * Mapillary is purpose-built for exactly this — its computer-vision
 * map-feature detections are openly licensed and intended for reuse —
 * so this is the ToS-clean version of the same idea.
 *
 * GATED ON ONE SECRET. process.env.MAPILLARY_TOKEN (server-only, set
 * by a human in .env.local / Vercel env — never in code). Absent it,
 * every call returns [] and the module is inert (same pattern as
 * google-places.ts). Verified live 2026-05-17: token authenticates,
 * the trash class is object--trash-can, ~51 detections downtown.
 *
 * Token hygiene: a token hand-pasted into a dotenv file very commonly
 * picks up a trailing "|" or whitespace (Mapillary tokens are
 * MLY|id|secret, and editors/clipboards add junk). A valid token never
 * ends in "|" or whitespace, so we defensively strip both — that one
 * stray character was a multi-round red herring; the integration
 * should just be robust to it.
 *
 * Output is the existing OsmPlace shape (category_slug "trash"), so it
 * is drop-in for the map's "Trash" amenities layer (now wired via the
 * server map page → AppMap extraAmenities).
 *
 * Honesty: we surface only what Mapillary's CV actually returned at the
 * confidence Mapillary itself reports — never a fabricated or inferred
 * can. Coverage depends on whether Mapillary imagery exists for an
 * area, so this can legitimately return [].
 */
import { FREDERICK_COUNTY_BBOX, type OsmPlace } from "./overpass";
import { MUNICIPALITIES } from "@/data/municipalities";

const ENDPOINT = "https://graph.mapillary.com/map_features";
const FETCH_TIMEOUT_MS = 15_000;

// Mapillary's map_features endpoint rejects any bbox larger than 0.010
// square degrees (HTTP 500). The whole county is ~0.26 sq°, so a single
// county query ALWAYS failed and silently returned [] — the real reason
// no trash ever showed. Mapillary only has street-level imagery where
// there are streets, so we tile a small box around each municipality
// centroid (0.09° per side = 0.0081 sq°, safely under the cap) and
// aggregate. Exported pure for unit testing.
const TILE_HALF_DEG = 0.045; // 0.09° per side → 0.0081 sq° < 0.010 cap

export function mapillaryTiles(): Array<[number, number, number, number]> {
  // [west, south, east, north] per tile, clamped to the county bbox.
  const [cs, cw, cn, ce] = FREDERICK_COUNTY_BBOX; // [south, west, north, east]
  return MUNICIPALITIES.map((m) => {
    const w = Math.max(cw, m.centroid.lng - TILE_HALF_DEG);
    const e = Math.min(ce, m.centroid.lng + TILE_HALF_DEG);
    const s = Math.max(cs, m.centroid.lat - TILE_HALF_DEG);
    const n = Math.min(cn, m.centroid.lat + TILE_HALF_DEG);
    return [w, s, e, n] as [number, number, number, number];
  });
}

/**
 * Mapillary point-object taxonomy value for a public waste basket.
 * Confirmed against the live taxonomy (2026-05-17). Kept as a list so
 * synonyms can be added if Mapillary revises class names.
 */
export const TRASH_OBJECT_VALUES = ["object--trash-can"] as const;

/**
 * The token as Mapillary will accept it: quotes, surrounding
 * whitespace, and any trailing "|" stripped. Returns "" when unset.
 */
export function mapillaryToken(): string {
  const raw = process.env.MAPILLARY_TOKEN;
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "").replace(/\|+$/, "").trim();
}

export function mapillaryConfigured(): boolean {
  return mapillaryToken().split("|").length === 3;
}

type MapillaryFeature = {
  id?: unknown;
  object_value?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown };
};

function inBbox(lng: number, lat: number): boolean {
  const [s, w, n, e] = FREDERICK_COUNTY_BBOX; // [south, west, north, east]
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * Pure: normalize a Mapillary map_features response into OsmPlace
 * trash points. Defensive — anything malformed, off-coordinate, or
 * outside the county bbox is dropped rather than guessed. Deduped by
 * ~11 m rounded coordinate so the same can seen from many images is
 * one pin. Exported for unit testing without a live token.
 */
export function normalizeMapillaryFeatures(raw: unknown): OsmPlace[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: OsmPlace[] = [];
  for (const f of data as MapillaryFeature[]) {
    const coords = (f?.geometry as { coordinates?: unknown })?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (!inBbox(lng, lat)) continue;
    const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = f?.id == null ? key : String(f.id);
    out.push({
      osm_id: `mly-${id}`,
      name: "Trash can",
      category_slug: "trash",
      osm_tag: `mapillary=${String(f?.object_value ?? "object--trash-can")}`,
      lng,
      lat,
    });
  }
  return out;
}

/**
 * Fetch Mapillary-detected trash cans for the county. Returns [] —
 * never throws into the map — when no token is configured. The token
 * goes in the Authorization header (not the URL) so it never lands in
 * a log or referrer, and is sanitized via mapillaryToken().
 */
/** One tile fetch + normalize. One retry on a 5xx (Mapillary 500s
 *  transiently). Any failure yields [] for that tile so a single bad
 *  tile never empties the whole map. */
async function fetchTile(
  token: string,
  [w, s, e, n]: [number, number, number, number],
): Promise<OsmPlace[]> {
  const url =
    `${ENDPOINT}?fields=id,object_value,geometry` +
    `&bbox=${w},${s},${e},${n}` +
    `&object_values=${TRASH_OBJECT_VALUES.join(",")}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Authorization: `OAuth ${token}`, Accept: "application/json" },
      });
      if (res.ok) return normalizeMapillaryFeatures(await res.json());
      if (res.status >= 500 && attempt === 0) continue; // transient — retry once
      return [];
    } catch {
      if (attempt === 0) continue; // network blip — retry once
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

export async function fetchMapillaryTrash(): Promise<OsmPlace[]> {
  const token = mapillaryToken();
  if (token.split("|").length !== 3) return []; // no/!valid token → inert

  // Tiles are small and bounded (one per municipality), so fetch them
  // in parallel; allSettled means one failed tile is just fewer cans,
  // never an empty map.
  const results = await Promise.allSettled(
    mapillaryTiles().map((t) => fetchTile(token, t)),
  );

  // Global dedupe across overlapping tiles, same ~11 m coordinate key
  // normalizeMapillaryFeatures uses within a tile.
  const seen = new Set<string>();
  const out: OsmPlace[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const p of r.value) {
      const key = `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}
