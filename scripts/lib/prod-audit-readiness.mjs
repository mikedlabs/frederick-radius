const SURFACES = ["today", "ask", "map", "events"];
const MIGRATIONS = ["hours", "search", "eventArchive", "sourceHealth"];
const HEARTBEATS = ["feeds", "eventArchive"];
const SURFACE_STATES = new Set(["ready", "partial", "hold"]);
const MIGRATION_STATES = new Set(["ready", "missing", "unknown"]);
const HEARTBEAT_STATES = new Set([
  "current",
  "stale",
  "failed",
  "missing",
  "unknown",
]);
const DATA_STATES = new Set(["current", "degraded", "unavailable"]);
const SURFACE_WEIGHT = { ready: 0, partial: 1, hold: 2 };

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function expectedMigrationStatus(values) {
  if (values.some((value) => value === "missing")) return "missing";
  if (values.some((value) => value === "unknown")) return "unknown";
  return values.every((value) => value === "ready") ? "ready" : null;
}

function expectedHeartbeatStatus(values) {
  if (values.some((value) => ["stale", "failed", "missing"].includes(value))) {
    return "degraded";
  }
  if (values.some((value) => value === "unknown")) return "unknown";
  return values.every((value) => value === "current") ? "current" : null;
}

function expectedSurfaceStatus(values) {
  if (!values.every((value) => SURFACE_STATES.has(value))) return null;
  return values.reduce(
    (worst, value) =>
      SURFACE_WEIGHT[value] > SURFACE_WEIGHT[worst] ? value : worst,
    "ready",
  );
}

function validateDataState(data, failures) {
  if (!data || !DATA_STATES.has(data.status)) {
    failures.push("data status is missing or invalid");
    return null;
  }

  const keys = ["tracked", "current", "stale", "attention", "unknown"];
  if (data.status === "unavailable") {
    if (keys.some((key) => data[key] !== null)) {
      failures.push("unavailable data status carries non-null source counts");
    }
    return data.status;
  }

  if (!keys.every((key) => Number.isInteger(data[key]) && data[key] >= 0)) {
    failures.push(`${data.status} data status is missing bounded source counts`);
    return data.status;
  }
  if (data.current > data.tracked) {
    failures.push("current source count exceeds tracked sources");
  }
  const accounted =
    data.current + data.stale + data.attention + data.unknown;
  if (accounted !== data.tracked) {
    failures.push("source-health counts do not add up to tracked sources");
  }
  const allCurrent =
    data.tracked > 0 &&
    data.current === data.tracked &&
    data.stale === 0 &&
    data.attention === 0 &&
    data.unknown === 0;
  if (data.status === "current" && !allCurrent) {
    failures.push("data status says current but source counts are degraded");
  }
  if (data.status === "degraded" && allCurrent) {
    failures.push("data status says degraded but every tracked source is current");
  }
  return data.status;
}

/**
 * Strict parser for the public health contract used by the production canary.
 * Optional source degradation may leave a surface `partial`; a release fails
 * only when a surface is on hold or when critical schema/worker evidence is
 * absent, unknown, or unhealthy.
 */
export function publicReadinessGate(payload) {
  const failures = [];
  const partialSurfaces = [];
  const root = object(payload);
  if (!root || root.service !== "frederick-radius") {
    return {
      passes: false,
      failures: ["response does not match the Frederick Radius health contract"],
      partialSurfaces,
    };
  }

  if (object(root.database)?.status !== "reachable") {
    failures.push("database is not reachable");
  }

  const data = object(root.data);
  const dataStatus = validateDataState(data, failures);

  const readiness = object(root.readiness);
  const migrations = object(readiness?.migrations);
  const heartbeats = object(readiness?.heartbeats);
  const surfaces = object(readiness?.surfaces);

  if (!readiness || !migrations || !heartbeats || !surfaces) {
    failures.push("release-readiness evidence is missing");
    return { passes: false, failures, partialSurfaces };
  }

  const migrationValues = [];
  for (const migration of MIGRATIONS) {
    const state = migrations[migration];
    migrationValues.push(state);
    if (!MIGRATION_STATES.has(state)) {
      failures.push(`${migration} migration state is missing or invalid`);
    } else if (state !== "ready") {
      failures.push(
        `${migration} migration state is ${JSON.stringify(state)}`,
      );
    }
  }
  const expectedMigrations = expectedMigrationStatus(migrationValues);
  if (migrations.status !== expectedMigrations) {
    failures.push(
      `migration aggregate is ${JSON.stringify(migrations.status ?? "missing")}; expected ${JSON.stringify(expectedMigrations)}`,
    );
  }

  const heartbeatValues = [];
  for (const heartbeat of HEARTBEATS) {
    const state = heartbeats[heartbeat];
    heartbeatValues.push(state);
    if (!HEARTBEAT_STATES.has(state)) {
      failures.push(`${heartbeat} heartbeat is missing or invalid`);
    } else if (state !== "current") {
      failures.push(
        `${heartbeat} heartbeat is ${JSON.stringify(state)}`,
      );
    }
  }
  const expectedHeartbeats = expectedHeartbeatStatus(heartbeatValues);
  if (heartbeats.status !== expectedHeartbeats) {
    failures.push(
      `heartbeat aggregate is ${JSON.stringify(heartbeats.status ?? "missing")}; expected ${JSON.stringify(expectedHeartbeats)}`,
    );
  }

  const surfaceValues = [];
  for (const surface of SURFACES) {
    const state = object(surfaces[surface])?.status;
    surfaceValues.push(state);
    if (!SURFACE_STATES.has(state)) {
      failures.push(`${surface} surface readiness is missing or invalid`);
    } else if (state === "hold") {
      failures.push(`${surface} surface is on release hold`);
    } else if (state === "partial") {
      partialSurfaces.push(surface);
    }
  }

  const expectedReadiness = expectedSurfaceStatus(surfaceValues);
  if (readiness.status !== expectedReadiness) {
    failures.push(
      `readiness aggregate is ${JSON.stringify(readiness.status ?? "missing")}; expected ${JSON.stringify(expectedReadiness)}`,
    );
  }

  if (dataStatus === "degraded") {
    const readySurface = SURFACES.find(
      (surface) => object(surfaces[surface])?.status === "ready",
    );
    if (readySurface) {
      failures.push(
        `data is degraded but ${readySurface} is marked ready`,
      );
    }
  } else if (dataStatus === "unavailable") {
    if (
      object(surfaces.today)?.status !== "hold" ||
      object(surfaces.events)?.status !== "hold" ||
      object(surfaces.ask)?.status === "ready" ||
      object(surfaces.map)?.status === "ready"
    ) {
      failures.push("unavailable data is inconsistent with surface fallbacks");
    }
  } else if (
    dataStatus === "current" &&
    expectedMigrations === "ready" &&
    expectedHeartbeats === "current" &&
    object(root.database)?.status === "reachable" &&
    surfaceValues.some((state) => state !== "ready")
  ) {
    failures.push("current dependencies are inconsistent with partial surfaces");
  }

  const expectedServiceStatus =
    object(root.database)?.status === "reachable" &&
    dataStatus === "current" &&
    expectedReadiness === "ready"
      ? "operational"
      : "degraded";
  if (root.status !== expectedServiceStatus) {
    failures.push(
      `service aggregate is ${JSON.stringify(root.status ?? "missing")}; expected ${JSON.stringify(expectedServiceStatus)}`,
    );
  }

  return {
    passes: failures.length === 0,
    failures,
    partialSurfaces,
  };
}
