"use client";

import { useEffect } from "react";
import type { DeferredBrowseLayers, MapLayerGroup } from "./deferredBrowseLayers";
import { LIVE_MAP_LAYER_GROUPS } from "./mapLayerFreshness";
import { loadMapLayers } from "./mapLayersClient";

/** Refresh only selected operational data; a hidden map starts no new work. */
export function useMapLayerRefresh(
  groups: readonly MapLayerGroup[],
  onUpdate: (layers: DeferredBrowseLayers) => void,
  enabled = true,
): void {
  const key = [...new Set(groups.filter((group) => LIVE_MAP_LAYER_GROUPS.includes(group)))].sort().join(",");
  useEffect(() => {
    if (!enabled || !key) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = key.split(",") as MapLayerGroup[];
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadMapLayers(active, { onlyExpired: true }).then((layers) => {
        if (alive) onUpdate(layers);
      });
    };
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 100);
    };
    const resume = () => { refresh(); schedule(); };
    refresh();
    schedule();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", resume);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", resume);
    };
  }, [enabled, key, onUpdate]);
}
