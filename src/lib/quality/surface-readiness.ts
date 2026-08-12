import type { PublicDatabaseHealth, PublicSourceHealth } from "@/lib/public-health";
import type { DataHealthPhaseRun } from "@/lib/quality/data-health-phases";

export const PUBLIC_SURFACES = ["today", "ask", "map", "events"] as const;
export type PublicSurface = (typeof PUBLIC_SURFACES)[number];

export type SurfaceReadinessStatus = "ready" | "partial" | "hold";
export type MigrationReadinessState = "ready" | "missing" | "unknown";
export type HeartbeatReadinessState =
  | "current"
  | "stale"
  | "failed"
  | "missing"
  | "unknown";

export type MigrationReadiness = {
  status: "ready" | "missing" | "unknown";
  hours: MigrationReadinessState;
  search: MigrationReadinessState;
  eventArchive: MigrationReadinessState;
  sourceHealth: MigrationReadinessState;
  dataTruth: MigrationReadinessState;
};

export type HeartbeatReadiness = {
  status: "current" | "degraded" | "unknown";
  feeds: HeartbeatReadinessState;
  eventArchive: HeartbeatReadinessState;
};

export type SurfaceReadinessReason =
  | "database_unavailable"
  | "source_health_unavailable"
  | "source_health_degraded"
  | "hours_schema_missing"
  | "hours_schema_unknown"
  | "search_schema_missing"
  | "search_schema_unknown"
  | "event_archive_schema_missing"
  | "event_archive_schema_unknown"
  | "source_health_schema_missing"
  | "source_health_schema_unknown"
  | "data_truth_schema_missing"
  | "data_truth_schema_unknown"
  | "feed_heartbeat_missing"
  | "feed_heartbeat_stale"
  | "feed_heartbeat_failed"
  | "feed_heartbeat_unknown"
  | "event_archive_heartbeat_missing"
  | "event_archive_heartbeat_stale"
  | "event_archive_heartbeat_failed"
  | "event_archive_heartbeat_unknown";

export type PublicSurfaceReadiness = {
  status: SurfaceReadinessStatus;
  reasons: SurfaceReadinessReason[];
};

export type PublicReleaseReadiness = {
  status: SurfaceReadinessStatus;
  migrations: MigrationReadiness;
  heartbeats: HeartbeatReadiness;
  surfaces: Record<PublicSurface, PublicSurfaceReadiness>;
};

export type OperationalReadinessEvidence = {
  migrations: Omit<MigrationReadiness, "status">;
  heartbeats: Omit<HeartbeatReadiness, "status">;
};

export const UNKNOWN_OPERATIONAL_READINESS: OperationalReadinessEvidence = {
  migrations: {
    hours: "unknown",
    search: "unknown",
    eventArchive: "unknown",
    sourceHealth: "unknown",
    dataTruth: "unknown",
  },
  heartbeats: {
    feeds: "unknown",
    eventArchive: "unknown",
  },
};

export const READINESS_ACTIVE_RUN_MAX_MS = 2 * 60_000;

const STATUS_WEIGHT: Record<SurfaceReadinessStatus, number> = {
  ready: 0,
  partial: 1,
  hold: 2,
};

const BAD_HEARTBEATS = new Set<HeartbeatReadinessState>([
  "missing",
  "stale",
  "failed",
]);

function heartbeatReason(
  prefix: "feed" | "event_archive",
  state: HeartbeatReadinessState,
): SurfaceReadinessReason | null {
  if (state === "current") return null;
  return `${prefix}_heartbeat_${state}` as SurfaceReadinessReason;
}

function addReason(
  result: PublicSurfaceReadiness,
  status: SurfaceReadinessStatus,
  reason: SurfaceReadinessReason,
): void {
  if (STATUS_WEIGHT[status] > STATUS_WEIGHT[result.status]) {
    result.status = status;
  }
  if (!result.reasons.includes(reason)) result.reasons.push(reason);
}

function migrationSummary(
  migrations: OperationalReadinessEvidence["migrations"],
): MigrationReadiness["status"] {
  const values = Object.values(migrations);
  if (values.some((value) => value === "missing")) return "missing";
  if (values.some((value) => value === "unknown")) return "unknown";
  return "ready";
}

function heartbeatSummary(
  heartbeats: OperationalReadinessEvidence["heartbeats"],
): HeartbeatReadiness["status"] {
  const values = Object.values(heartbeats);
  if (values.some((value) => BAD_HEARTBEATS.has(value))) return "degraded";
  if (values.some((value) => value === "unknown")) return "unknown";
  return "current";
}

/**
 * Pure release-readiness reducer for the four primary decision surfaces.
 *
 * `partial` means the public surface still has an honest fallback and may stay
 * available. `hold` means a release must not be promoted because a dependency
 * that supports a live claim is explicitly absent or its current-data worker
 * is explicitly unhealthy. This is deliberately separate from HTTP liveness.
 */
export function derivePublicReleaseReadiness(input: {
  database: PublicDatabaseHealth["status"];
  data: PublicSourceHealth["status"];
  operational: OperationalReadinessEvidence;
}): PublicReleaseReadiness {
  const surfaces: Record<PublicSurface, PublicSurfaceReadiness> = {
    today: { status: "ready", reasons: [] },
    ask: { status: "ready", reasons: [] },
    map: { status: "ready", reasons: [] },
    events: { status: "ready", reasons: [] },
  };

  if (input.database !== "reachable") {
    for (const surface of PUBLIC_SURFACES) {
      addReason(surfaces[surface], "partial", "database_unavailable");
    }
  }

  if (input.data === "unavailable") {
    addReason(surfaces.today, "hold", "source_health_unavailable");
    addReason(surfaces.events, "hold", "source_health_unavailable");
    addReason(surfaces.ask, "partial", "source_health_unavailable");
    addReason(surfaces.map, "partial", "source_health_unavailable");
  } else if (input.data === "degraded") {
    for (const surface of PUBLIC_SURFACES) {
      addReason(surfaces[surface], "partial", "source_health_degraded");
    }
  }

  const { migrations, heartbeats } = input.operational;
  const migrationRules: Array<{
    state: MigrationReadinessState;
    missingReason: SurfaceReadinessReason;
    unknownReason: SurfaceReadinessReason;
    missingStatus: SurfaceReadinessStatus;
    surfaces: readonly PublicSurface[];
  }> = [
    {
      state: migrations.hours,
      missingReason: "hours_schema_missing",
      unknownReason: "hours_schema_unknown",
      missingStatus: "hold",
      surfaces: ["today"],
    },
    {
      state: migrations.search,
      missingReason: "search_schema_missing",
      unknownReason: "search_schema_unknown",
      // Ask retains deterministic local retrieval when its semantic index is
      // unavailable, so this is a release-visible partial rather than a lie.
      missingStatus: "partial",
      surfaces: ["ask"],
    },
    {
      state: migrations.eventArchive,
      missingReason: "event_archive_schema_missing",
      unknownReason: "event_archive_schema_unknown",
      missingStatus: "hold",
      surfaces: ["today", "events"],
    },
    {
      state: migrations.sourceHealth,
      missingReason: "source_health_schema_missing",
      unknownReason: "source_health_schema_unknown",
      missingStatus: "partial",
      surfaces: PUBLIC_SURFACES,
    },
    {
      state: migrations.dataTruth,
      missingReason: "data_truth_schema_missing",
      unknownReason: "data_truth_schema_unknown",
      // This evidence store improves publication quality but is not yet a
      // runtime dependency for the four public decision surfaces.
      missingStatus: "partial",
      surfaces: PUBLIC_SURFACES,
    },
  ];
  for (const rule of migrationRules) {
    if (rule.state === "ready") continue;
    for (const surface of rule.surfaces) {
      addReason(
        surfaces[surface],
        rule.state === "missing" ? rule.missingStatus : "partial",
        rule.state === "missing" ? rule.missingReason : rule.unknownReason,
      );
    }
  }

  const feedReason = heartbeatReason("feed", heartbeats.feeds);
  if (feedReason) {
    const status = BAD_HEARTBEATS.has(heartbeats.feeds) ? "hold" : "partial";
    addReason(surfaces.today, status, feedReason);
    addReason(surfaces.events, status, feedReason);
    addReason(surfaces.ask, "partial", feedReason);
    addReason(surfaces.map, "partial", feedReason);
  }

  const eventArchiveReason = heartbeatReason(
    "event_archive",
    heartbeats.eventArchive,
  );
  if (eventArchiveReason) {
    const status = BAD_HEARTBEATS.has(heartbeats.eventArchive)
      ? "hold"
      : "partial";
    addReason(surfaces.today, status, eventArchiveReason);
    addReason(surfaces.events, status, eventArchiveReason);
  }

  return {
    status: PUBLIC_SURFACES.reduce<SurfaceReadinessStatus>(
      (worst, surface) =>
        STATUS_WEIGHT[surfaces[surface].status] > STATUS_WEIGHT[worst]
          ? surfaces[surface].status
          : worst,
      "ready",
    ),
    migrations: {
      status: migrationSummary(migrations),
      ...migrations,
    },
    heartbeats: {
      status: heartbeatSummary(heartbeats),
      ...heartbeats,
    },
    surfaces,
  };
}

/** Convert the latest strict worker row into the bounded public state. */
export function classifyReadinessHeartbeat(
  run: DataHealthPhaseRun | null,
  now: Date,
  maxAgeMs: number,
  options: {
    allowPartial?: boolean;
    completedRun?: DataHealthPhaseRun | null;
    activeRunMaxMs?: number;
  } = {},
): HeartbeatReadinessState {
  if (!run) return "missing";
  const startedMs = run.startedAt ? Date.parse(run.startedAt) : Number.NaN;
  const ageMs = Number.isFinite(startedMs)
    ? now.getTime() - startedMs
    : Number.POSITIVE_INFINITY;
  if (ageMs < 0 || !Number.isFinite(ageMs)) return "stale";
  if (run.status === "running") {
    if (ageMs > (options.activeRunMaxMs ?? READINESS_ACTIVE_RUN_MAX_MS)) {
      return "failed";
    }
    // A normal cron overlap is not a failed heartbeat. Continue to trust the
    // most recent completed run during the worker's declared runtime budget.
    // If the worker never recorded a prior completion, report missing rather
    // than inventing success from an in-progress row.
    return options.completedRun
      ? classifyReadinessHeartbeat(
          options.completedRun,
          now,
          maxAgeMs,
          {
            allowPartial: options.allowPartial,
            activeRunMaxMs: options.activeRunMaxMs,
          },
        )
      : "missing";
  }
  if (ageMs > maxAgeMs) return "stale";
  if (!run.endedAt) return "failed";
  if (run.status === "ok" && run.recordsFailed === 0) return "current";
  // The feed worker records `partial` when its bounded run completed and
  // persisted healthy providers but one optional upstream failed. Source
  // health carries that degradation separately; the worker heartbeat itself
  // is still current. Phase/database failures are written as `error` and can
  // never pass this allowance.
  if (
    options.allowPartial &&
    run.status === "partial" &&
    run.recordsIn > 0 &&
    run.recordsUpserted > 0
  ) {
    return "current";
  }
  return "failed";
}
