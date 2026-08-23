import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
  mapLayerGroupHasVisibleData,
  mergeDeferredBrowseLayerGroup,
  parseDeferredBrowseLayers,
  type DeferredBrowseLayers,
  type MapLayerGroup,
} from "./deferredBrowseLayers";
import { beginMapSourceTiming } from "./mapPerf";

let snapshot = EMPTY_DEFERRED_BROWSE_LAYERS;
const pendingByGroup = new Map<MapLayerGroup, Promise<DeferredBrowseLayers>>();
const loadedGroups = new Set<MapLayerGroup>();

function recordTransportFailure(group: MapLayerGroup): DeferredBrowseLayers {
  const prior = snapshot.sourceHealth[group];
  snapshot = {
    ...snapshot,
    sourceHealth: {
      ...snapshot.sourceHealth,
      [group]: {
        status: mapLayerGroupHasVisibleData(group, snapshot)
          ? "partial"
          : "unavailable",
        unavailable: [
          ...new Set([...(prior?.unavailable ?? []), "Map data service"]),
        ].slice(0, 8),
      },
    },
  };
  return snapshot;
}

/**
 * Session-deduped optional map context. Browse and the hidden radius branch
 * share this request, so switching modes cannot launch a second provider
 * fan-out while the first is still in flight.
 */
function loadMapLayerGroup(group: MapLayerGroup): Promise<DeferredBrowseLayers> {
  if (loadedGroups.has(group)) return Promise.resolve(snapshot);
  const existing = pendingByGroup.get(group);
  if (existing) return existing;
  const priorHealth = snapshot.sourceHealth[group];
  const retryingDegradedGroup = Boolean(
    priorHealth && priorHealth.status !== "current",
  );
  const finishTiming = beginMapSourceTiming("other");
  const pending = fetch(`/api/map/layers?groups=${encodeURIComponent(group)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    // Keep the route's intentionally finite public cache keys. The explicit
    // retry still bypasses the browser/CDN copy that produced the warning.
    ...(retryingDegradedGroup ? { cache: "no-store" as const } : {}),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Map layers returned ${response.status}`);
      const payload = parseDeferredBrowseLayers(await response.json());
      snapshot = mergeDeferredBrowseLayerGroup(snapshot, payload, group);
      // A partial response remains useful, but it must stay retryable. Marking
      // it settled for the whole session made a provider outage look like a
      // genuine empty layer until the person reloaded the entire map.
      if (
        !payload.sourceHealth[group] ||
        payload.sourceHealth[group]?.status === "current"
      ) {
        loadedGroups.add(group);
      }
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
      // Optional map data fails soft, but never silently. Returning the last
      // useful snapshot with explicit health lets the map stay usable and
      // prevents a transport outage from masquerading as “nothing nearby.”
      return recordTransportFailure(group);
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
