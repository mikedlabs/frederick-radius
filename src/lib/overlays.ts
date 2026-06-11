/**
 * Map overlay registry (data brief 6.3, 6.4).
 *
 * One source of truth for the six overlays the map can draw. The Layers
 * control renders from this list, the URL persists the active set as
 * ?layers=art,historic so a view is shareable, and every overlay ships
 * DARK by default: the map opens clean and the reader pulls a layer in
 * when they want it, never the other way around.
 *
 * Each overlay loads lazily on toggle from its endpoint (static GeoJSON
 * with a long cache and an ETag, per 6.3), so toggling one never blocks
 * first paint and an untouched layer costs nothing. Layers whose data is
 * not seeded yet carry `ready: false`: the control can show them as
 * coming soon rather than toggling an empty source.
 */

export type OverlayKey =
  | "trails"
  | "parks"
  | "historic"
  | "art"
  | "markets"
  | "bridges";

export type OverlayDef = {
  key: OverlayKey;
  /** Verb-first control label, per the writing rules. */
  label: string;
  /** One line on what the layer draws and where it comes from. */
  sources: string;
  /** Lazy GeoJSON endpoint, fetched on first toggle. */
  endpoint: string;
  /** False until the layer's data is seeded; the control shows it as
   *  coming soon instead of toggling an empty source. */
  ready: boolean;
};

export const OVERLAYS: OverlayDef[] = [
  {
    key: "trails",
    label: "Trails",
    sources: "County park trails, the Appalachian Trail, and the C&O Towpath",
    endpoint: "/api/overlays/trails",
    ready: false,
  },
  {
    key: "parks",
    label: "Parks",
    sources: "County parks, from Frederick County GIS",
    endpoint: "/api/overlays/parks",
    ready: true,
  },
  {
    key: "historic",
    label: "Historic cemeteries",
    sources: "Frederick County historic cemeteries, from county open data",
    endpoint: "/api/overlays/historic",
    ready: true,
  },
  {
    key: "art",
    label: "Public art",
    sources: "The curated Frederick public art trail, with photos and artists",
    endpoint: "/api/overlays/public-art",
    ready: true,
  },
  {
    key: "markets",
    label: "Farmers markets",
    sources: "Farmers markets across the Frederick region, from county GIS",
    endpoint: "/api/overlays/markets",
    ready: true,
  },
  {
    key: "bridges",
    label: "Covered bridges",
    sources: "Utica Mills, Loy's Station, and Roddy Road covered bridges, from county GIS",
    endpoint: "/api/overlays/bridges",
    ready: true,
  },
];

const VALID = new Set<string>(OVERLAYS.map((o) => o.key));

/**
 * Parse the ?layers= param into the active overlay set. Unknown keys are
 * dropped so a stale or hand-edited URL can never toggle a phantom
 * layer; order and duplicates do not matter.
 */
export function parseLayersParam(raw: string | null | undefined): OverlayKey[] {
  if (!raw) return [];
  const seen = new Set<OverlayKey>();
  for (const part of raw.split(",")) {
    const k = part.trim().toLowerCase();
    if (VALID.has(k)) seen.add(k as OverlayKey);
  }
  return [...seen];
}

/**
 * Serialize the active set back to a stable ?layers= value: registry
 * order, comma-joined, empty string when nothing is active (so the param
 * drops out of the URL rather than lingering as ?layers=).
 */
export function serializeLayers(active: Iterable<OverlayKey>): string {
  const set = new Set(active);
  return OVERLAYS.filter((o) => set.has(o.key)).map((o) => o.key).join(",");
}
