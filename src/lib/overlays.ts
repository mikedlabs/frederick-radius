/**
 * Map overlay registry (data brief 6.3, 6.4).
 *
 * One source of truth for the GIS overlays the map can draw. The Layers
 * control renders from this list, the URL persists the active set as
 * ?layers=art,parks so a view is shareable, and every overlay ships
 * DARK by default: the map opens clean and the reader pulls a layer in
 * when they want it, never the other way around.
 *
 * Trails and cemeteries are NOT here: they ship as first-class live map
 * layers with their own counts (showTrails / showCemeteries in AppMap),
 * so listing them again as overlays double-printed them in the Layers
 * tab (a live "Trails" plus a "soon" placeholder; "Cemeteries" plus a
 * "Historic cemeteries"). This registry holds only the overlays that
 * have no live-layer twin.
 *
 * Each overlay loads lazily on toggle from its endpoint (committed GeoJSON or
 * a small, allowlisted server normalization of an official public source), so
 * toggling one never blocks first paint and an untouched layer costs nothing.
 * Every response has an ETag and source-appropriate cache policy. Layers whose
 * data is not ready carry `ready: false`: the control can show them as coming
 * soon rather than toggling an empty source.
 */

export type OverlayKey =
  | "parks"
  | "planning"
  | "mobility"
  | "art"
  | "markets"
  | "bridges";

export type OverlayDef = {
  key: OverlayKey;
  /** Verb-first control label, per the writing rules. */
  label: string;
  /** One line on what the layer draws and where it comes from. */
  sources: string;
  /** Honest domain limit repeated in the feature popup. */
  caveat?: string;
  /** Quiet identity above the feature name in its popup. */
  popupLabel: string;
  /** Lazy GeoJSON endpoint, fetched on first toggle. */
  endpoint: string;
  /** False until the layer's data is seeded; the control shows it as
   *  coming soon instead of toggling an empty source. */
  ready: boolean;
};

export const OVERLAYS: OverlayDef[] = [
  {
    key: "parks",
    label: "County parks",
    popupLabel: "County park",
    sources: "From Frederick County Government's public parks GIS layer.",
    caveat:
      "A mapped park does not confirm that its facilities are open or available right now.",
    endpoint: "/api/overlays/parks",
    ready: true,
  },
  {
    key: "planning",
    label: "Projects & applications",
    popupLabel: "Planning and project record",
    sources:
      "Official City and County planning, project, and development-review records.",
    caveat:
      "Planning, application, approval, and construction are different stages. Open a record to see the source's exact status.",
    endpoint: "/api/overlays/planning",
    ready: true,
  },
  {
    key: "mobility",
    label: "City walking network",
    popupLabel: "City walking record",
    sources:
      "Sidewalks, ramps, and Path Plan records from the City of Frederick's public GIS.",
    caveat:
      "Only paths explicitly marked existing may support route context. Planned and proposed paths are shown for context, and the advertised City bike-path service is currently unavailable.",
    endpoint: "/api/overlays/city-mobility",
    ready: true,
  },
  {
    key: "art",
    label: "Public art",
    popupLabel: "Public art",
    sources: "The curated Frederick public art trail, with photos and artists",
    endpoint: "/api/overlays/public-art",
    // The curated file intentionally contains no approved pieces yet. Do not
    // advertise a working layer that opens onto an empty map; the control will
    // light up automatically when the human-reviewed catalog is populated.
    ready: false,
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
 * order (parks, planning, mobility, art, markets, bridges), comma-joined, empty string when
 * nothing is active (so the param drops out of the URL rather than
 * lingering as ?layers=).
 */
export function serializeLayers(active: Iterable<OverlayKey>): string {
  const set = new Set(active);
  return OVERLAYS.filter((o) => set.has(o.key)).map((o) => o.key).join(",");
}
