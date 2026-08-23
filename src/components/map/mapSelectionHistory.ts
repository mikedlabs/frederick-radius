const MAP_SELECTION_HISTORY_KEY = "__frederickRadiusMapSelectionV1";
const MAP_SELECTION_SNAPSHOT_KEY =
  "__frederickRadiusMapSelectionSnapshotV1";

export type MapSelectionHistorySnapshot = {
  kind: string;
  value: unknown;
  contextLabel?: string;
};

function historyRecord(state: unknown): Record<string, unknown> {
  return state !== null && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string" && record[key] !== "";
}

function hasCoordinates(record: Record<string, unknown>): boolean {
  return Number.isFinite(record.lng) && Number.isFinite(record.lat);
}

function hasGeometry(record: Record<string, unknown>): boolean {
  const geom = record.geom;
  return Boolean(
    geom &&
      typeof geom === "object" &&
      !Array.isArray(geom) &&
      hasCoordinates(geom as Record<string, unknown>),
  );
}

function validSelectionValue(kind: string, value: unknown): boolean {
  if (kind === "marc") return typeof value === "string" && value !== "";
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;

  switch (kind) {
    case "place":
      return hasString(record, "slug") && hasGeometry(record);
    case "raw":
      return record._kind === "osm"
        ? hasString(record, "osm_id") && hasCoordinates(record)
        : record._kind === "place" &&
            hasString(record, "slug") &&
            hasGeometry(record);
    case "event":
      return hasString(record, "slug") && hasCoordinates(record);
    case "event-group":
      return (
        hasString(record, "id") &&
        hasCoordinates(record) &&
        Array.isArray(record.events) &&
        record.events.length > 0 &&
        record.events.every(
          (event) =>
            event !== null &&
            typeof event === "object" &&
            !Array.isArray(event) &&
            hasString(event as Record<string, unknown>, "slug"),
        )
      );
    case "town":
      return (
        hasString(record, "slug") &&
        hasString(record, "name") &&
        hasCoordinates(record)
      );
    case "transit":
      return (
        hasString(record, "id") &&
        hasString(record, "name") &&
        hasCoordinates(record)
      );
    case "aerial":
      return hasString(record, "src") && hasCoordinates(record);
    case "cemetery":
      return (
        hasString(record, "id") &&
        hasString(record, "name") &&
        hasCoordinates(record)
      );
    case "parking":
    case "food-truck":
      return (
        hasString(record, "slug") &&
        hasString(record, "name") &&
        hasCoordinates(record)
      );
    case "discovery": {
      const center = record.center;
      return (
        hasString(record, "id") &&
        hasString(record, "title") &&
        Array.isArray(center) &&
        center.length === 2 &&
        center.every(Number.isFinite)
      );
    }
    case "spot":
      return hasCoordinates(record);
    default:
      return false;
  }
}

/**
 * Add Radius' result-sheet marker without discarding Next.js' own history
 * fields. The URL carries the selected entity; this marker only tells the map
 * whether Back/Forward is entering its one closeable selection entry.
 */
export function markMapSelectionHistoryState(
  state: unknown,
  snapshot?: MapSelectionHistorySnapshot,
): Record<string, unknown> {
  const marked: Record<string, unknown> = {
    ...historyRecord(state),
    [MAP_SELECTION_HISTORY_KEY]: true,
  };
  // Switching from one result kind to another reuses the same browser entry.
  // Never let an earlier request survive when the new owner has no snapshot
  // (for example, a provider-owned live popup).
  delete marked[MAP_SELECTION_SNAPSHOT_KEY];
  if (snapshot) marked[MAP_SELECTION_SNAPSHOT_KEY] = snapshot;
  return marked;
}

export function isMapSelectionHistoryState(state: unknown): boolean {
  return historyRecord(state)[MAP_SELECTION_HISTORY_KEY] === true;
}

/**
 * Validate a replayable selection independent of where it was carried. The
 * browser history marker and the session-only token store both use this one
 * parser so neither trusts arbitrary JSON merely because Radius wrote a key.
 */
export function parseMapSelectionHistorySnapshot(
  snapshot: unknown,
): MapSelectionHistorySnapshot | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const candidate = snapshot as Record<string, unknown>;
  if (
    typeof candidate.kind !== "string" ||
    !("value" in candidate) ||
    !validSelectionValue(candidate.kind, candidate.value) ||
    (candidate.contextLabel !== undefined &&
      typeof candidate.contextLabel !== "string")
  ) {
    return null;
  }
  return {
    kind: candidate.kind,
    value: candidate.value,
    ...(candidate.contextLabel === undefined
      ? {}
      : { contextLabel: candidate.contextLabel }),
  };
}

/**
 * Read only snapshots Radius itself can safely replay. Browser history state
 * is mutable by other scripts and extensions, so a private marker is not a
 * reason to trust an arbitrary object as a map selection request.
 */
export function readMapSelectionHistorySnapshot(
  state: unknown,
): MapSelectionHistorySnapshot | null {
  if (!isMapSelectionHistoryState(state)) return null;
  const snapshot = historyRecord(state)[MAP_SELECTION_SNAPSHOT_KEY];
  return parseMapSelectionHistorySnapshot(snapshot);
}
