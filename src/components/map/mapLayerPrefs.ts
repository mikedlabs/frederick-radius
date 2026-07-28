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
const KEY = "fr:map-layers:v2";
const LEGACY_KEY = "fr:map-layers:v1";

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
  traffic?: boolean;
  incidents?: boolean;
  aviation?: boolean;
  cameras?: boolean;
  firestations?: boolean;
  civicplaces?: boolean;
};

export function readMapLayerPrefs(): MapLayerPrefs {
  if (typeof window === "undefined") return {};
  try {
    const current = window.localStorage.getItem(KEY);
    if (current) {
      const parsed = JSON.parse(current);
      return parsed && typeof parsed === "object" ? (parsed as MapLayerPrefs) : {};
    }

    // v1 wrote Transit=true during the old automatic cold open, so it cannot
    // distinguish a user choice from inherited UI noise. Migrate every other
    // explicit layer once and let Transit return to the new neutral default.
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const migrated = { ...(parsed as MapLayerPrefs) };
    delete migrated.transit;
    window.localStorage.removeItem(LEGACY_KEY);
    writeMapLayerPrefs(migrated);
    return migrated;
  } catch {
    return {};
  }
}

export function writeMapLayerPrefs(p: MapLayerPrefs): void {
  if (typeof window === "undefined") return;
  try {
    // Drop empty/false noise so the stored blob stays small. Every layer now
    // defaults off, so only an explicit On choice needs to survive reload.
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
    if (p.traffic) slim.traffic = true;
    if (p.incidents) slim.incidents = true;
    if (p.aviation) slim.aviation = true;
    if (p.cameras) slim.cameras = true;
    if (p.firestations) slim.firestations = true;
    if (p.civicplaces) slim.civicplaces = true;
    if (Object.keys(slim).length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    /* storage unavailable (private mode / quota) — silently skip */
  }
}
