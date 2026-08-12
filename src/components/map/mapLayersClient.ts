import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
  mergeDeferredBrowseLayerGroup,
  parseDeferredBrowseLayers,
  type DeferredBrowseLayers,
  type MapLayerGroup,
} from "./deferredBrowseLayers";
import { beginMapSourceTiming } from "./mapPerf";

let snapshot = EMPTY_DEFERRED_BROWSE_LAYERS;
const pendingByGroup = new Map<MapLayerGroup, Promise<DeferredBrowseLayers>>();
const loadedGroups = new Set<MapLayerGroup>();

/**
 * Session-deduped optional map context. Browse and the hidden radius branch
 * share this request, so switching modes cannot launch a second provider
 * fan-out while the first is still in flight.
 */
function loadMapLayerGroup(group: MapLayerGroup): Promise<DeferredBrowseLayers> {
  if (loadedGroups.has(group)) return Promise.resolve(snapshot);
  const existing = pendingByGroup.get(group);
  if (existing) return existing;
  const finishTiming = beginMapSourceTiming("other");
  const pending = fetch(`/api/map/layers?groups=${encodeURIComponent(group)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Map layers returned ${response.status}`);
      const payload = parseDeferredBrowseLayers(await response.json());
      snapshot = mergeDeferredBrowseLayerGroup(snapshot, payload, group);
      loadedGroups.add(group);
      const hasContext = Object.values(payload).some((value) =>
        Array.isArray(value)
          ? value.length > 0
          : Boolean(
              value &&
                typeof value === "object" &&
                "features" in value &&
                Array.isArray(value.features) &&
                value.features.length > 0,
            ),
      );
      finishTiming(hasContext ? "ready" : "empty");
      return snapshot;
    })
    .catch((error) => {
      const aborted =
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError";
      finishTiming(aborted ? "aborted" : "error");
      throw error;
    })
    .finally(() => pendingByGroup.delete(group));
  pendingByGroup.set(group, pending);
  return pending;
}

export async function loadMapLayers(
  groups: readonly MapLayerGroup[] = ["context"],
): Promise<DeferredBrowseLayers> {
  await Promise.all([...new Set(groups)].map(loadMapLayerGroup));
  return snapshot;
}

/** Test/retry hook; a successful session keeps its settled context. */
export function resetMapLayersRequest(): void {
  pendingByGroup.clear();
  loadedGroups.clear();
  snapshot = EMPTY_DEFERRED_BROWSE_LAYERS;
}
