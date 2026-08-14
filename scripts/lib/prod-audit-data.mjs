const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;

const nonnegativeInteger = (value) =>
  Number.isInteger(value) && value >= 0;

function sourceHealthWarnings(sourceHealth) {
  const health = object(sourceHealth);
  if (!health?.degraded) return [];
  const unavailable = Array.isArray(health.unavailable)
    ? health.unavailable.filter((value) => typeof value === "string")
    : [];
  return unavailable.length > 0
    ? [`public read reports unavailable sources: ${unavailable.join(", ")}`]
    : ["public read reports degraded source coverage"];
}

const ARCHIVE_FAILURE_STATES = new Set([
  "stale",
  "failed",
  "invalid",
  "unavailable",
]);

export function publicEventReadGate(
  payload,
  {
    minimumEvents = 20,
    minimumSources = 8,
    dominantSourceWarningShare = 0.75,
  } = {},
) {
  const failures = [];
  const warnings = [];
  const root = object(payload);
  const events = Array.isArray(root?.events) ? root.events : null;
  const count = events?.length ?? null;
  const sourceHealth = object(root?.sourceHealth);
  const archive = object(sourceHealth?.archive);
  const archiveState = archive?.state;
  const sourceCounts = new Map();

  if (!events) {
    failures.push("events payload is missing an events array");
  } else {
    if (events.some((event) => !object(event))) {
      failures.push("events payload contains a non-object row");
    }
    for (const event of events) {
      const source = object(event)?.source;
      if (typeof source !== "string" || !source.trim()) continue;
      const key = source.trim();
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    }
    if (count < minimumEvents) {
      failures.push(
        `public event inventory contains ${count} row(s); minimum is ${minimumEvents}`,
      );
    }
    if (sourceCounts.size < minimumSources) {
      failures.push(
        `public event inventory contains ${sourceCounts.size} source(s); minimum is ${minimumSources}`,
      );
    }
    const dominantCount = Math.max(0, ...sourceCounts.values());
    const dominantSourceShare = count > 0 ? dominantCount / count : null;
    if (
      dominantSourceShare !== null &&
      dominantSourceShare > dominantSourceWarningShare
    ) {
      warnings.push(
        `one source supplies ${(dominantSourceShare * 100).toFixed(1)}% of public events`,
      );
    }
  }

  if (typeof archiveState !== "string") {
    failures.push("public event read has no bounded archive-health evidence");
  } else if (ARCHIVE_FAILURE_STATES.has(archiveState)) {
    failures.push(`public event archive is ${archiveState}`);
  } else if (archiveState !== "current" && archiveState !== "provider_partial") {
    failures.push(`public event archive has unknown state ${JSON.stringify(archiveState)}`);
  }

  const healthWarnings = sourceHealthWarnings(sourceHealth);
  // A named provider-only partial result is operationally important, but it
  // does not erase readable last-known-good rows. Broken archive evidence is
  // a failure above even when the row count happens to remain high.
  warnings.push(...healthWarnings);

  return {
    passes: failures.length === 0,
    failures,
    warnings,
    count,
    sourceCount: sourceCounts.size,
  };
}

export function publicFoodTruckScheduleGate(
  payload,
  {
    minimumSources = 5,
    maximumAgeHours = 36,
    nowMs = Date.now(),
  } = {},
) {
  const failures = [];
  const warnings = [];
  const root = object(payload);
  const counts = object(root?.counts);
  const stopCount = counts?.stops;
  const sourceCount = counts?.sources;
  const healthySources = counts?.healthySources;
  const failedSources = counts?.failedSources;
  const suspiciousSources = counts?.suspiciousSources;

  if (root?.ok !== true || root?.status !== "current") {
    failures.push(
      `food-truck schedule is ${JSON.stringify(root?.status ?? "unavailable")}`,
    );
  }
  if (!nonnegativeInteger(stopCount)) {
    failures.push("food-truck stop count is missing or invalid");
  } else if (stopCount === 0) {
    // A quiet week can be legitimate. Log it for trend review without
    // inventing a truck location or forcing a false outage.
    warnings.push("food-truck schedule currently contains zero published stops");
  }
  if (!nonnegativeInteger(sourceCount) || sourceCount < minimumSources) {
    failures.push(
      `food-truck schedule has ${String(sourceCount)} source(s); minimum is ${minimumSources}`,
    );
  }
  if (
    !nonnegativeInteger(healthySources) ||
    !nonnegativeInteger(failedSources) ||
    healthySources + failedSources !== sourceCount ||
    failedSources > 0
  ) {
    failures.push("food-truck source-health counts are incomplete or degraded");
  }
  if (!nonnegativeInteger(suspiciousSources) || suspiciousSources > 0) {
    failures.push("food-truck schedule has an unexplained source-count change");
  }

  const generatedMs = Date.parse(root?.generatedAt ?? "");
  const ageHours = Number.isFinite(generatedMs)
    ? Math.max(0, nowMs - generatedMs) / 3_600_000
    : null;
  if (ageHours === null || ageHours > maximumAgeHours) {
    failures.push(
      ageHours === null
        ? "food-truck schedule has no valid generation timestamp"
        : `food-truck schedule is ${ageHours.toFixed(1)} hours old; limit is ${maximumAgeHours}`,
    );
  }

  return {
    passes: failures.length === 0,
    failures,
    warnings,
    stopCount: nonnegativeInteger(stopCount) ? stopCount : null,
    sourceCount: nonnegativeInteger(sourceCount) ? sourceCount : null,
    ageHours,
  };
}

export function publicFoodTruckBeaconGate(payload) {
  const failures = [];
  const root = object(payload);
  const pins = Array.isArray(root?.pins) ? root.pins : null;

  if (root?.ok !== true) failures.push("food-truck beacon read is not healthy");
  if (!pins) failures.push("food-truck beacon read is missing its pins array");

  return {
    passes: failures.length === 0,
    failures,
    count: pins?.length ?? null,
  };
}
