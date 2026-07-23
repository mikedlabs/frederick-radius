export type LiveLayerHealthStatus =
  | "ready"
  | "empty"
  | "stale"
  | "disabled"
  | "unavailable";

/**
 * Small health envelope shared by live map/data layers. "Empty" means a
 * successful response with zero rows; "unavailable" means the source could
 * not be verified. Keeping those states separate prevents a blank layer from
 * being presented as proof that nothing is happening.
 */
export type LiveLayerHealth = {
  status: LiveLayerHealthStatus;
  count: number;
  source: string;
  /** ISO time supplied by the source or fetch boundary. */
  timestamp: string | null;
};

export type LiveLayerHealthInput = {
  count?: number;
  source: string;
  timestamp?: string | Date | null;
  disabled?: boolean;
  unavailable?: boolean;
  maxAgeMs?: number;
  now?: Date;
};

function isoTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function liveLayerHealth(
  input: LiveLayerHealthInput,
): LiveLayerHealth {
  const count = Math.max(0, Math.floor(input.count ?? 0));
  const timestamp = isoTimestamp(input.timestamp);
  let status: LiveLayerHealthStatus;

  if (input.disabled) {
    status = "disabled";
  } else if (input.unavailable) {
    status = "unavailable";
  } else if (
    input.maxAgeMs !== undefined &&
    timestamp &&
    (input.now ?? new Date()).getTime() - Date.parse(timestamp) >
      input.maxAgeMs
  ) {
    status = "stale";
  } else {
    status = count > 0 ? "ready" : "empty";
  }

  return {
    status,
    count,
    source: input.source,
    timestamp,
  };
}

export function liveLayerUsable(health: LiveLayerHealth): boolean {
  return health.status === "ready" || health.status === "empty";
}
