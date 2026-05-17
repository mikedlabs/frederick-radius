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
 * GATED AND DORMANT BY DEFAULT — like cofParcels. Two independent
 * gates, both required, so nothing can light up by accident:
 *   1. process.env.MAPILLARY_TOKEN must be set (the secret, server-only,
 *      added by a human to .env.local / Vercel env — never in code).
 *   2. process.env.MAPILLARY_TRASH must equal "1" (the explicit
 *      activation flag; mirrors COF_PARCELS=1). A token alone does
 *      nothing — a human flips this on at activation.
 * Absent either, every call returns [] and this module is inert. It is
 * also NOT wired into the map yet; wiring fetchMapillaryTrash() into
 * the amenities layer is itself the human activation step. So merely
 * landing this file changes nothing a user sees.
 *
 * Output is the existing OsmPlace shape (category_slug "trash"), so it
 * is drop-in for the map's "Trash" amenities layer the day it is wired.
 *
 * Honesty: we surface only what Mapillary's CV actually returned at the
 * confidence Mapillary itself reports — never a fabricated or inferred
 * can. Coverage depends on whether Mapillary imagery exists for an
 * area, so this can legitimately return [] even when activated.
 */
import { FREDERICK_COUNTY_BBOX, type OsmPlace } from "./overpass";

const ENDPOINT = "https://graph.mapillary.com/map_features";
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Mapillary point-object taxonomy value(s) for a public waste basket.
 * VERIFY-AT-ACTIVATION: confirm the exact value(s) against the live
 * taxonomy before flipping MAPILLARY_TRASH on — Mapillary occasionally
 * revises class names, and an empty result usually means a stale value
 * here, not "no cans". Kept as a list so synonyms can be added.
 */
export const TRASH_OBJECT_VALUES = ["object--trash-can"] as const;

export function mapillaryConfigured(): boolean {
  return Boolean(process.env.MAPILLARY_TOKEN) && process.env.MAPILLARY_TRASH === "1";
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
 * never throws into the map — unless BOTH gates are set. The token
 * goes in the Authorization header (not the URL) so it never lands in
 * a log or referrer.
 */
export async function fetchMapillaryTrash(): Promise<OsmPlace[]> {
  if (process.env.MAPILLARY_TRASH !== "1") return []; // dormant flag
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return []; // no secret → inert

  const [s, w, n, e] = FREDERICK_COUNTY_BBOX;
  const url =
    `${ENDPOINT}?fields=id,object_value,geometry` +
    `&bbox=${w},${s},${e},${n}` +
    `&object_values=${TRASH_OBJECT_VALUES.join(",")}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Authorization: `OAuth ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    return normalizeMapillaryFeatures(await res.json());
  } catch {
    return []; // network/abort/parse — degrade silently, never fabricate
  } finally {
    clearTimeout(timer);
  }
}
