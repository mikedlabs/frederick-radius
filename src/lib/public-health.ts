import "server-only";

import { getSql } from "@/lib/db/client";
import { EVENT_ARCHIVE_REQUIREMENTS } from "@/lib/ingest/event-schema-readiness";
import { getSourceHealthLedger } from "@/lib/quality/source-ledger.server";
import type {
  SourceLedgerRow,
  SourceLedgerState,
} from "@/lib/quality/source-ledger";
import {
  DATA_HEALTH_FEEDS_RUN,
  EVENT_ARCHIVE_RUN,
  type DataHealthPhaseRun,
} from "@/lib/quality/data-health-phases";
import {
  classifyReadinessHeartbeat,
  derivePublicReleaseReadiness,
  UNKNOWN_OPERATIONAL_READINESS,
  type OperationalReadinessEvidence,
  type PublicReleaseReadiness,
} from "@/lib/quality/surface-readiness";

const DATABASE_DEADLINE_MS = 1_000;
const SOURCE_LEDGER_DEADLINE_MS = 1_000;
const OPERATIONAL_READINESS_DEADLINE_MS = 1_000;
// Public readiness follows the actual two-hour worker schedules, not the
// nightly reporter's narrow handoff window. These budgets allow one delayed
// invocation without letting a dead cron look current indefinitely.
const FEED_HEARTBEAT_MAX_AGE_MS = 5 * 60 * 60_000;
const EVENT_ARCHIVE_HEARTBEAT_MAX_AGE_MS = 5 * 60 * 60_000;
export const PUBLIC_HEALTH_CACHE_MAX_AGE_MS = 30_000;

type DeadlineResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected" }
  | { status: "timeout" };

export type PublicDatabaseHealth = {
  status: "reachable" | "unavailable" | "timeout";
  latencyMs: number | null;
};

export type PublicSourceHealth = {
  status: "current" | "degraded" | "unavailable";
  tracked: number | null;
  current: number | null;
  stale: number | null;
  attention: number | null;
  unknown: number | null;
  /** Additive detail for operators; legacy aggregate fields remain stable. */
  diagnostics: {
    upstreamUnreachable: number;
    collectionFailed: number;
    unconfigured: number;
    invalidEvidence: number;
    awaitingPublish: number;
    requiredEmpty: number;
    running: number;
    reachableUnvalidated: number;
    neverObserved: number;
  } | null;
  lastPublishedAt: string | null;
};

export type PublicHealthSnapshot = {
  service: "frederick-radius";
  status: "operational" | "degraded";
  generatedAt: string;
  deployment: {
    environment: "production" | "preview" | "development" | "unknown";
    revision: string | null;
  };
  database: PublicDatabaseHealth;
  data: PublicSourceHealth;
  readiness: PublicReleaseReadiness;
};

type HealthDependencies = {
  now: () => Date;
  environment: string | undefined;
  revision: string | undefined;
  probeDatabase: () => Promise<void>;
  loadSourceLedger: () => Promise<SourceLedgerRow[]>;
  loadOperationalReadiness: (
    now: Date,
  ) => Promise<OperationalReadinessEvidence>;
  databaseDeadlineMs: number;
  sourceLedgerDeadlineMs: number;
  operationalReadinessDeadlineMs: number;
};

type PublicHealthCacheOptions = {
  nowMs?: () => number;
  ttlMs?: number;
};

const ATTENTION_STATES = new Set<SourceLedgerState>([
  "failing",
  "unconfigured",
  "invalid_evidence",
  "awaiting_publish",
  "required_empty",
]);

const UNKNOWN_STATES = new Set<SourceLedgerState>(["running", "unknown"]);

function withinDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
): Promise<DeadlineResult<T>> {
  let timer: ReturnType<typeof setTimeout>;
  const guarded = promise.then<DeadlineResult<T>, DeadlineResult<T>>(
    (value) => ({ status: "fulfilled", value }),
    () => ({ status: "rejected" }),
  );
  const deadline = new Promise<DeadlineResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), deadlineMs);
  });
  return Promise.race([guarded, deadline]).finally(() => clearTimeout(timer));
}

function logDependencyFailure(
  dependency: "database" | "source-ledger" | "operational-readiness",
  outcome: "rejected" | "timeout",
): void {
  // Keep this machine-readable but deliberately omit thrown messages, query
  // text, URLs, and environment values. The public response stays equally
  // compact while operators can distinguish a fast rejection from a deadline.
  console.warn(JSON.stringify({
    level: "warn",
    event: "public_health_dependency_failure",
    dependency,
    outcome,
  }));
}

function deploymentEnvironment(
  value: string | undefined,
): PublicHealthSnapshot["deployment"]["environment"] {
  return value === "production" ||
    value === "preview" ||
    value === "development"
    ? value
    : "unknown";
}

function publicRevision(value: string | undefined): string | null {
  const clean = value?.trim() ?? "";
  return /^[a-f0-9]{7,64}$/i.test(clean) ? clean.slice(0, 12) : null;
}

function latestIso(values: Array<string | null>): string | null {
  let latest: { value: string; time: number } | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) continue;
    if (!latest || time > latest.time) latest = { value, time };
  }
  return latest?.value ?? null;
}

/**
 * Reduce the internal ledger to a fixed-size public summary. The endpoint
 * never exposes source names, missing setting names, URLs, or upstream error
 * messages.
 */
export function summarizePublicSourceHealth(
  rows: readonly SourceLedgerRow[],
): PublicSourceHealth {
  const active = rows.filter((row) => row.manifestStatus === "active");
  const current = active.filter(
    (row) => row.state === "healthy" || row.state === "healthy_empty",
  ).length;
  const stale = active.filter((row) => row.state === "stale").length;
  const attention = active.filter((row) =>
    ATTENTION_STATES.has(row.state),
  ).length;
  const unknown = active.filter((row) =>
    UNKNOWN_STATES.has(row.state),
  ).length;
  const countReason = (reasonCode: SourceLedgerRow["reasonCode"]) =>
    active.filter((row) => row.reasonCode === reasonCode).length;

  return {
    status:
      active.length > 0 &&
      current === active.length
        ? "current"
        : "degraded",
    tracked: active.length,
    current,
    stale,
    attention,
    unknown,
    diagnostics: {
      upstreamUnreachable: countReason("upstream_unreachable"),
      collectionFailed: countReason("collection_failed"),
      unconfigured: countReason("configuration_missing"),
      invalidEvidence: countReason("evidence_timestamp_invalid"),
      awaitingPublish: countReason("publication_missing"),
      requiredEmpty: countReason("publication_required_empty"),
      running: countReason("collection_running"),
      reachableUnvalidated: countReason(
        "upstream_reachable_validation_missing",
      ),
      neverObserved: countReason("source_not_observed"),
    },
    lastPublishedAt: latestIso(
      active.map((row) => row.lastPublishedAt),
    ),
  };
}

async function defaultDatabaseProbe(): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  await sql`SELECT 1 AS ok`;
}

type MigrationGroup = keyof OperationalReadinessEvidence["migrations"];

type MigrationRequirement =
  | {
      group: MigrationGroup;
      kind: "column";
      relation: string;
      column: string;
    }
  | {
      group: MigrationGroup;
      kind: "function";
      signature: string;
      result: string;
    };

const columns = (
  group: MigrationGroup,
  relation: string,
  names: readonly string[],
): MigrationRequirement[] => names.map((column) => ({
  group,
  kind: "column",
  relation,
  column,
}));

const MIGRATION_REQUIREMENTS: readonly MigrationRequirement[] = [
  ...columns("hours", "place_hours_refresh", [
    "slug",
    "place_id",
    "weekday_hours",
    "business_status",
    "refreshed_at",
  ]),
  ...columns("search", "radius_search_documents", [
    "kind",
    "source_id",
    "content_hash",
    "content",
    "metadata",
    "fts",
    "embedding",
    "updated_at",
  ]),
  ...EVENT_ARCHIVE_REQUIREMENTS.map(
    (requirement): MigrationRequirement => ({
      group: "eventArchive",
      kind: "column",
      relation: requirement.table,
      column: requirement.column,
    }),
  ),
  {
    group: "eventArchive",
    kind: "function",
    signature: "public_event_archive_by_slug(text)",
    result: "TABLE(canonical_slug text, snapshot jsonb)",
  },
  ...columns("sourceHealth", "feed_source_health", [
    "source",
    "taken_at",
    "count",
    "free_ratio",
    "empty_desc_ratio",
    "top_venue",
    "top_category",
    "earliest",
    "latest",
    "prior_snapshot",
    "recent_mean_count",
    "recent_observations",
    "updated_at",
  ]),
];

async function defaultOperationalReadiness(
  now: Date,
): Promise<OperationalReadinessEvidence> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");

  const groups = MIGRATION_REQUIREMENTS.map((requirement) => requirement.group);
  const kinds = MIGRATION_REQUIREMENTS.map((requirement) => requirement.kind);
  const relations = MIGRATION_REQUIREMENTS.map((requirement) =>
    requirement.kind === "column" ? requirement.relation : ""
  );
  const requiredColumns = MIGRATION_REQUIREMENTS.map((requirement) =>
    requirement.kind === "column" ? requirement.column : ""
  );
  const signatures = MIGRATION_REQUIREMENTS.map((requirement) =>
    requirement.kind === "function" ? requirement.signature : ""
  );
  const functionResults = MIGRATION_REQUIREMENTS.map((requirement) =>
    requirement.kind === "function" ? requirement.result : ""
  );
  const heartbeatSources = [DATA_HEALTH_FEEDS_RUN, EVENT_ARCHIVE_RUN];

  const rows = await sql`
    WITH requirements AS (
      SELECT *
      FROM unnest(
        ${groups}::text[],
        ${kinds}::text[],
        ${relations}::text[],
        ${requiredColumns}::text[],
        ${signatures}::text[],
        ${functionResults}::text[]
      ) AS requirement(
        group_name,
        object_kind,
        relation_name,
        column_name,
        function_signature,
        function_result
      )
    ),
    migration_state AS (
      SELECT group_name,
             bool_and(
               (object_kind = 'column'
                 AND EXISTS (
                   SELECT 1
                   FROM information_schema.columns AS available
                   JOIN pg_class AS relation
                     ON relation.relname = available.table_name
                   JOIN pg_namespace AS namespace
                     ON namespace.oid = relation.relnamespace
                    AND namespace.nspname = available.table_schema
                   WHERE available.table_schema = 'public'
                     AND available.table_name = relation_name
                     AND available.column_name = column_name
                     AND relation.relrowsecurity = true
                 ))
               OR
               (object_kind = 'function'
                 AND EXISTS (
                   SELECT 1
                   FROM pg_proc AS routine
                   WHERE routine.oid = to_regprocedure(
                     'public.' || function_signature
                   )
                     AND pg_get_function_result(routine.oid) = function_result
                     AND routine.prosecdef = true
                     AND routine.provolatile = 's'
                     AND routine.proisstrict = true
                     AND NOT EXISTS (
                       SELECT 1
                       FROM aclexplode(
                         coalesce(
                           routine.proacl,
                           acldefault('f', routine.proowner)
                         )
                       ) AS privilege
                       WHERE privilege.grantee = 0
                         AND privilege.privilege_type = 'EXECUTE'
                     )
                     AND (
                       SELECT count(*) = 3
                         AND bool_and(
                           has_function_privilege(
                             grantee.oid,
                             routine.oid,
                             'EXECUTE'
                           )
                         )
                       FROM pg_roles AS grantee
                       WHERE grantee.rolname = ANY(
                         ARRAY['anon', 'authenticated', 'service_role']
                       )
                     )
                 ))
             ) AS ready
      FROM requirements
      GROUP BY group_name
    ),
    heartbeat_sources AS (
      SELECT unnest(${heartbeatSources}::text[]) AS source_slug
    ),
    heartbeat_runs AS (
      SELECT heartbeat_sources.source_slug,
             'latest'::text AS run_role,
             latest.status,
             latest.started_at,
             latest.ended_at,
             latest.records_in,
             latest.records_upserted,
             latest.records_failed
      FROM heartbeat_sources
      LEFT JOIN LATERAL (
        SELECT status, started_at, ended_at,
               records_in, records_upserted, records_failed
        FROM ingest_runs
        WHERE source_slug = heartbeat_sources.source_slug
        ORDER BY started_at DESC
        LIMIT 1
      ) latest ON true
      UNION ALL
      SELECT heartbeat_sources.source_slug,
             'completed'::text AS run_role,
             completed.status,
             completed.started_at,
             completed.ended_at,
             completed.records_in,
             completed.records_upserted,
             completed.records_failed
      FROM heartbeat_sources
      LEFT JOIN LATERAL (
        SELECT status, started_at, ended_at,
               records_in, records_upserted, records_failed
        FROM ingest_runs
        WHERE source_slug = heartbeat_sources.source_slug
          AND ended_at IS NOT NULL
          AND status <> 'running'
        ORDER BY started_at DESC
        LIMIT 1
      ) completed ON true
    )
    SELECT 'migration'::text AS evidence_kind,
           group_name::text AS evidence_key,
           CASE WHEN ready THEN 'ready' ELSE 'missing' END::text AS status,
           NULL::timestamptz AS started_at,
           NULL::timestamptz AS ended_at,
           0::integer AS records_in,
           0::integer AS records_upserted,
           0::integer AS records_failed
    FROM migration_state
    UNION ALL
    SELECT ('heartbeat_' || run_role)::text AS evidence_kind,
           source_slug::text AS evidence_key,
           status,
           started_at,
           ended_at,
           coalesce(records_in, 0)::integer,
           coalesce(records_upserted, 0)::integer,
           coalesce(records_failed, 0)::integer
    FROM heartbeat_runs
  ` as unknown as Array<{
    evidence_kind: "migration" | "heartbeat_latest" | "heartbeat_completed";
    evidence_key: string;
    status: string | null;
    started_at: string | Date | null;
    ended_at: string | Date | null;
    records_in: number;
    records_upserted: number;
    records_failed: number;
  }>;

  const migrations: OperationalReadinessEvidence["migrations"] = {
    hours: "missing",
    search: "missing",
    eventArchive: "missing",
    sourceHealth: "missing",
  };
  for (const row of rows) {
    if (
      row.evidence_kind === "migration" &&
      row.evidence_key in migrations
    ) {
      migrations[row.evidence_key as MigrationGroup] =
        row.status === "ready" ? "ready" : "missing";
    }
  }

  const heartbeatBySource = new Map<string, DataHealthPhaseRun>();
  const completedHeartbeatBySource = new Map<string, DataHealthPhaseRun>();
  for (const row of rows) {
    if (row.evidence_kind === "migration" || !row.started_at) continue;
    const run: DataHealthPhaseRun = {
      source: row.evidence_key,
      status: row.status,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      recordsIn: Number(row.records_in ?? 0),
      recordsUpserted: Number(row.records_upserted ?? 0),
      recordsFailed: Number(row.records_failed ?? 0),
      error: null,
    };
    if (row.evidence_kind === "heartbeat_completed") {
      completedHeartbeatBySource.set(row.evidence_key, run);
    } else {
      heartbeatBySource.set(row.evidence_key, run);
    }
  }

  return {
    migrations,
    heartbeats: {
      feeds: classifyReadinessHeartbeat(
        heartbeatBySource.get(DATA_HEALTH_FEEDS_RUN) ?? null,
        now,
        FEED_HEARTBEAT_MAX_AGE_MS,
        {
          allowPartial: true,
          completedRun:
            completedHeartbeatBySource.get(DATA_HEALTH_FEEDS_RUN) ?? null,
        },
      ),
      eventArchive: classifyReadinessHeartbeat(
        heartbeatBySource.get(EVENT_ARCHIVE_RUN) ?? null,
        now,
        EVENT_ARCHIVE_HEARTBEAT_MAX_AGE_MS,
        // A bounded archive run may finish `partial` when one optional live
        // provider is unavailable even though the archive itself advanced.
        // Source health still exposes that degradation; the worker heartbeat
        // should answer the narrower question: did the archive job complete
        // and persist useful records on schedule?
        {
          allowPartial: true,
          completedRun:
            completedHeartbeatBySource.get(EVENT_ARCHIVE_RUN) ?? null,
        },
      ),
    },
  };
}

const DEFAULT_DEPENDENCIES: HealthDependencies = {
  now: () => new Date(),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  revision: process.env.VERCEL_GIT_COMMIT_SHA,
  probeDatabase: defaultDatabaseProbe,
  // Health checks must not inherit the admin ledger's fail-soft SQL behavior:
  // a broken evidence query is "unavailable", not an empty but valid ledger.
  loadSourceLedger: () =>
    getSourceHealthLedger({ strictDatabaseEvidence: true }),
  loadOperationalReadiness: defaultOperationalReadiness,
  databaseDeadlineMs: DATABASE_DEADLINE_MS,
  sourceLedgerDeadlineMs: SOURCE_LEDGER_DEADLINE_MS,
  operationalReadinessDeadlineMs: OPERATIONAL_READINESS_DEADLINE_MS,
};

/**
 * Public operational status for uptime checks.
 *
 * Database and source-ledger work are separately deadline-bounded. A slow
 * dependency cannot hold this route open, and late rejections are consumed by
 * `withinDeadline` rather than becoming unhandled promise rejections.
 */
export async function getPublicHealthSnapshot(
  overrides: Partial<HealthDependencies> = {},
): Promise<PublicHealthSnapshot> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const generatedAt = dependencies.now().toISOString();
  const databaseStartedAt = performance.now();
  const databaseResult = await withinDeadline(
    dependencies.probeDatabase(),
    dependencies.databaseDeadlineMs,
  );
  if (databaseResult.status !== "fulfilled") {
    logDependencyFailure("database", databaseResult.status);
  }
  const databaseLatencyMs =
    databaseResult.status === "fulfilled"
      ? Math.max(0, Math.round(performance.now() - databaseStartedAt))
      : null;
  const database: PublicDatabaseHealth = {
    status:
      databaseResult.status === "fulfilled"
        ? "reachable"
        : databaseResult.status === "timeout"
          ? "timeout"
          : "unavailable",
    latencyMs: databaseLatencyMs,
  };

  let data: PublicSourceHealth = {
    status: "unavailable",
    tracked: null,
    current: null,
    stale: null,
    attention: null,
    unknown: null,
    diagnostics: null,
    lastPublishedAt: null,
  };
  let operational = UNKNOWN_OPERATIONAL_READINESS;

  if (database.status === "reachable") {
    const [sourceResult, operationalResult] = await Promise.all([
      withinDeadline(
        dependencies.loadSourceLedger(),
        dependencies.sourceLedgerDeadlineMs,
      ),
      withinDeadline(
        dependencies.loadOperationalReadiness(new Date(generatedAt)),
        dependencies.operationalReadinessDeadlineMs,
      ),
    ]);
    if (sourceResult.status === "fulfilled") {
      data = summarizePublicSourceHealth(sourceResult.value);
    } else {
      logDependencyFailure("source-ledger", sourceResult.status);
    }
    if (operationalResult.status === "fulfilled") {
      operational = operationalResult.value;
    } else {
      logDependencyFailure("operational-readiness", operationalResult.status);
    }
  }

  const readiness = derivePublicReleaseReadiness({
    database: database.status,
    data: data.status,
    operational,
  });

  return {
    service: "frederick-radius",
    status:
      database.status === "reachable" &&
      data.status === "current" &&
      readiness.status === "ready"
        ? "operational"
        : "degraded",
    generatedAt,
    deployment: {
      environment: deploymentEnvironment(dependencies.environment),
      revision: publicRevision(dependencies.revision),
    },
    database,
    data,
    readiness,
  };
}

/**
 * Small per-instance cache for the public status route.
 *
 * `/api/health` is a predictable probe target and must not turn anonymous
 * polling into one database probe plus two ledger queries per request. This
 * wrapper coalesces concurrent misses and keeps a completed snapshot for at
 * most 30 seconds. The HTTP response remains `no-store`; this is only an
 * origin-side work shield, not a browser or CDN cache.
 */
export function createCoalescedPublicHealthLoader(
  load: () => Promise<PublicHealthSnapshot>,
  options: PublicHealthCacheOptions = {},
): () => Promise<PublicHealthSnapshot> {
  const nowMs = options.nowMs ?? Date.now;
  const ttlMs = Math.max(
    0,
    Math.min(
      PUBLIC_HEALTH_CACHE_MAX_AGE_MS,
      options.ttlMs ?? PUBLIC_HEALTH_CACHE_MAX_AGE_MS,
    ),
  );
  let cached:
    | { value: PublicHealthSnapshot; expiresAtMs: number }
    | null = null;
  let inFlight: Promise<PublicHealthSnapshot> | null = null;

  return () => {
    const now = nowMs();
    if (cached && now < cached.expiresAtMs) {
      return Promise.resolve(cached.value);
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const value = await load();
        cached = {
          value,
          expiresAtMs: nowMs() + ttlMs,
        };
        return value;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

export const getCachedPublicHealthSnapshot =
  createCoalescedPublicHealthLoader(getPublicHealthSnapshot);
