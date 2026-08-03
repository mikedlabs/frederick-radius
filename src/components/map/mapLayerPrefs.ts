/**
 * Remembered map-layer choices (per device).
 *
 * The map's cold open is intentionally CLEAN — activeCats starts empty ("show
 * everything") and deep-links / mode-defaults drive first paint. Persistence
 * reference layers ON TOP of that WITHOUT reversing it: only deliberate GIS
 * context (radar, transit, trails, and similar layers) is restored. Task state
 * such as a place category or restroom/trash search is deliberately NOT
 * persisted; a returning user should never inherit an invisible old question.
 * Deep-links remain authoritative at the call site.
 *
 * localStorage only, read/written client-side (AppMap is dynamic ssr:false, so
 * there is no SSR/hydration concern).
 */
const KEY = "fr:map-layers:v3";
const PREVIOUS_KEY = "fr:map-layers:v2";
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
};

export function readMapLayerPrefs(): MapLayerPrefs {
  if (typeof window === "undefined") return {};
  try {
    const current = window.localStorage.getItem(KEY);
    if (current) {
      const parsed = JSON.parse(current);
      if (!parsed || typeof parsed !== "object") return {};
      const cleaned = { ...(parsed as MapLayerPrefs) };
      // Older v2 clients stored task filters. Purge them on read so a clean
      // /map visit is actually clean after this release.
      delete cleaned.cats;
      delete cleaned.amenities;
      if ("cats" in parsed || "amenities" in parsed) writeMapLayerPrefs(cleaned);
      return cleaned;
    }

    // v2 was live while Transit could be seeded automatically on entry. A
    // stored `transit:true` therefore does not prove that the visitor chose
    // the layer, and it made a plain /map arrival silently become
    // /map?show=transit. Carry forward every other deliberate reference layer,
    // but reset Transit once so the map reopens on its neutral places view.
    const previous = window.localStorage.getItem(PREVIOUS_KEY);
    if (previous) {
      const parsed = JSON.parse(previous);
      if (!parsed || typeof parsed !== "object") return {};
      const migrated = { ...(parsed as MapLayerPrefs) };
      delete migrated.cats;
      delete migrated.amenities;
      delete migrated.transit;
      window.localStorage.removeItem(PREVIOUS_KEY);
      writeMapLayerPrefs(migrated);
      return migrated;
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
    if (Object.keys(slim).length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    /* storage unavailable (private mode / quota) — silently skip */
  }
}
