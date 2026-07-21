/**
 * Remembered map-layer choices (per device).
 *
 * The map's cold open is intentionally CLEAN — activeCats starts empty ("show
 * everything") and deep-links / mode-defaults drive first paint. Persistence
 * layers ON TOP of that WITHOUT reversing it: only what the user EXPLICITLY
 * turned on is restored, and a first-time visitor (no stored prefs) still gets
 * the clean default. Deep-links take precedence over stored prefs at the call
 * site. The transient "saved only" / "field notes only" FOCUS filters are
 * deliberately NOT persisted — a returning user shouldn't be stuck seeing only
 * their saves without asking.
 *
 * localStorage only, read/written client-side (AppMap is dynamic ssr:false, so
 * there is no SSR/hydration concern).
 */
const KEY = "fr:map-layers:v1";

export type MapLayerPrefs = {
  cats?: string[];
  amenities?: string[];
  civic?: boolean;
  transit?: boolean;
  trails?: boolean;
  aerial?: boolean;
  cemeteries?: boolean;
  parking?: boolean;
  radar?: boolean;
  incidents?: boolean;
  cameras?: boolean;
  firestations?: boolean;
};

export function readMapLayerPrefs(): MapLayerPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as MapLayerPrefs) : {};
  } catch {
    return {};
  }
}

export function writeMapLayerPrefs(p: MapLayerPrefs): void {
  if (typeof window === "undefined") return;
  try {
    // Drop empty/false noise so the stored blob stays small and a cleared map
    // round-trips to "nothing remembered" (not a wall of false flags).
    const slim: MapLayerPrefs = {};
    if (p.cats && p.cats.length) slim.cats = p.cats;
    if (p.amenities && p.amenities.length) slim.amenities = p.amenities;
    if (p.civic) slim.civic = true;
    if (p.transit) slim.transit = true;
    if (p.trails) slim.trails = true;
    if (p.aerial) slim.aerial = true;
    if (p.cemeteries) slim.cemeteries = true;
    if (p.parking) slim.parking = true;
    if (p.radar) slim.radar = true;
    if (p.firestations) slim.firestations = true;
    if (Object.keys(slim).length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    /* storage unavailable (private mode / quota) — silently skip */
  }
}
