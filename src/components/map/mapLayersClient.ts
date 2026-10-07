import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
  mapLayerGroupHasVisibleData,
  mergeDeferredBrowseLayerGroup,
  parseDeferredBrowseLayers,
  retainedMapLayerSnapshotTime,
  type DeferredBrowseLayers,
  type MapLayerGroup,
} from "./deferredBrowseLayers";
import {
  MAP_LAYER_MAX_AGE_MS,
  MAP_LAYER_REQUEST_TIMEOUT_MS,
  MAP_LAYER_RETRY_INTERVAL_MS,
} from "./mapLayerFreshness";
import { beginMapSourceTiming } from "./mapPerf";

let snapshot = EMPTY_DEFERRED_BROWSE_LAYERS;
const loadedAt = new Map<MapLayerGroup, number>();
const attemptedAt = new Map<MapLayerGroup, number>();
const pendingByGroup = new Map<MapLayerGroup, {
  promise: Promise<DeferredBrowseLayers>;
  controller: AbortController;
}>();

function isExpired(group: MapLayerGroup, now: number): boolean {
  const at = loadedAt.get(group);
  return at === undefined || now - at >= MAP_LAYER_MAX_AGE_MS[group];
}

function markOlderData(group: MapLayerGroup): void {
  if (!loadedAt.has(group)) return;
  const prior = snapshot.sourceHealth[group] ?? {
    status: mapLayerGroupHasVisibleData(group, snapshot) ? "partial" as const : "unavailable" as const,
    unavailable: [],
    asOf: new Date(loadedAt.get(group)!).toISOString(),
  };
  // An incomplete empty first response is not a known empty snapshot.
  // Aging metadata alone must not prevent useful catalog context arriving.
  if (prior.status !== "current" && !prior.stale &&
    !mapLayerGroupHasVisibleData(group, snapshot)) return;
  // Group health can already be stale after a partial merge while that same
  // response supplied newly current weather. Age weather independently.
  const conditionsAreOlder = (group === "signals" || group === "roads") &&
    snapshot.smartSignals?.conditionsStatus === "current" &&
    !(["signals", "roads"] as const).some((other) => other !== group && !isExpired(other, Date.now()));
  if (prior.stale && !conditionsAreOlder) return;
  snapshot = {
    ...snapshot,
    sourceHealth: prior.stale ? snapshot.sourceHealth : { ...snapshot.sourceHealth, [group]: { ...prior, stale: true } },
    ...(conditionsAreOlder && snapshot.smartSignals
      ? { smartSignals: { ...snapshot.smartSignals, conditionsStatus: "stale" as const } }
      : {}),
  };
}

function recordTransportFailure(group: MapLayerGroup): DeferredBrowseLayers {
  const prior = snapshot.sourceHealth[group];
  const asOf = retainedMapLayerSnapshotTime(group, snapshot);
  snapshot = {
    ...snapshot,
    sourceHealth: {
      ...snapshot.sourceHealth,
      [group]: {
        ...prior,
        ...(asOf ? { asOf } : {}),
        status: mapLayerGroupHasVisibleData(group, snapshot) ? "partial" : "unavailable",
        ...(mapLayerGroupHasVisibleData(group, snapshot) ? { stale: true } : {}),
        unavailable: [...new Set([...(prior?.unavailable ?? []), "Map data service"])].slice(0, 8),
      },
    },
  };
  return snapshot;
}

/** Shared finite-age snapshots. Only named groups can start source work. */
function loadMapLayerGroup(group: MapLayerGroup, onlyExpired: boolean): Promise<DeferredBrowseLayers> {
  const now = Date.now();
  const expired = isExpired(group, now);
  if (expired) markOlderData(group);
  const existing = pendingByGroup.get(group);
  if (existing) return existing.promise;
  const priorHealth = snapshot.sourceHealth[group];
  const degraded = priorHealth && (priorHealth.status !== "current" || priorHealth.stale);
  if (!expired && (onlyExpired || !degraded)) return Promise.resolve(snapshot);
  const lastAttempt = attemptedAt.get(group);
  if (onlyExpired && lastAttempt !== undefined && now - lastAttempt < Math.max(MAP_LAYER_RETRY_INTERVAL_MS, MAP_LAYER_MAX_AGE_MS[group])) {
    return Promise.resolve(snapshot);
  }
  attemptedAt.set(group, now);
  const controller = new AbortController();
  const finishTiming = beginMapSourceTiming("other");
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("Map data check timed out", "AbortError"));
    }, MAP_LAYER_REQUEST_TIMEOUT_MS);
  });
  // Race both headers and the JSON body. Only the winning request may merge;
  // an adapter that ignores abort cannot later replace newer map evidence.
  const request = async () => {
    const response = await fetch(`/api/map/layers?groups=${encodeURIComponent(group)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      ...((loadedAt.has(group) || degraded) ? { cache: "no-store" as const } : {}),
    });
    if (!response.ok) throw new Error(`Map layers returned ${response.status}`);
    return { payload: parseDeferredBrowseLayers(await response.json()), age: Number(response.headers.get("Age") ?? 0) };
  };
  const flight = { controller, promise: Promise.resolve(snapshot) };
  flight.promise = Promise.race([request(), deadline])
    .then(({ payload, age }) => {
      if (controller.signal.aborted || pendingByGroup.get(group) !== flight) {
        finishTiming("aborted");
        return snapshot;
      }
      const received = Date.now();
      const health = payload.sourceHealth[group];
      const sourceTime = health?.asOf ? Date.parse(health.asOf) : received;
      const responseTime = Number.isFinite(age) && age >= 0 ? received - age * 1_000 : received;
      const at = Math.min(sourceTime, responseTime, received);
      snapshot = mergeDeferredBrowseLayerGroup(snapshot, payload, group);
      if (!health || health.status !== "unavailable") loadedAt.set(group, at);
      if (isExpired(group, received)) markOlderData(group);
      finishTiming(mapLayerGroupHasVisibleData(group, payload) ? "ready" : "empty");
      return snapshot;
    })
    .catch((error) => {
      if (pendingByGroup.get(group) !== flight) {
        finishTiming("aborted");
        return snapshot;
      }
      finishTiming(error instanceof DOMException && error.name === "AbortError" ? "aborted" : "error");
      return recordTransportFailure(group);
    })
    .finally(() => {
      clearTimeout(timer);
      if (pendingByGroup.get(group) === flight) pendingByGroup.delete(group);
    });
  pendingByGroup.set(group, flight);
  return flight.promise;
}

export async function loadMapLayers(
  groups: readonly MapLayerGroup[] = ["context"],
  { onlyExpired = false }: { onlyExpired?: boolean } = {},
): Promise<DeferredBrowseLayers> {
  await Promise.all([...new Set(groups)].map((group) => loadMapLayerGroup(group, onlyExpired)));
  return snapshot;
}

/** Clearing a request also retires ownership of any late network/body result. */
export function resetMapLayersRequest(): void {
  for (const flight of pendingByGroup.values()) flight.controller.abort();
  pendingByGroup.clear();
  loadedAt.clear();
  attemptedAt.clear();
  snapshot = EMPTY_DEFERRED_BROWSE_LAYERS;
}
