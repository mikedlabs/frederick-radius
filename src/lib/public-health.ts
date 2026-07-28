import "server-only";

import { getSql } from "@/lib/db/client";
import { getSourceHealthLedger } from "@/lib/quality/source-ledger.server";
import type {
  SourceLedgerRow,
  SourceLedgerState,
} from "@/lib/quality/source-ledger";

const DATABASE_DEADLINE_MS = 1_000;
const SOURCE_LEDGER_DEADLINE_MS = 1_000;
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
};

type HealthDependencies = {
  now: () => Date;
  environment: string | undefined;
  revision: string | undefined;
  probeDatabase: () => Promise<void>;
  loadSourceLedger: () => Promise<SourceLedgerRow[]>;
  databaseDeadlineMs: number;
  sourceLedgerDeadlineMs: number;
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

const DEFAULT_DEPENDENCIES: HealthDependencies = {
  now: () => new Date(),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  revision: process.env.VERCEL_GIT_COMMIT_SHA,
  probeDatabase: defaultDatabaseProbe,
  // Health checks must not inherit the admin ledger's fail-soft SQL behavior:
  // a broken evidence query is "unavailable", not an empty but valid ledger.
  loadSourceLedger: () =>
    getSourceHealthLedger({ strictDatabaseEvidence: true }),
  databaseDeadlineMs: DATABASE_DEADLINE_MS,
  sourceLedgerDeadlineMs: SOURCE_LEDGER_DEADLINE_MS,
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
    lastPublishedAt: null,
  };

  if (database.status === "reachable") {
    const sourceResult = await withinDeadline(
      dependencies.loadSourceLedger(),
      dependencies.sourceLedgerDeadlineMs,
    );
    if (sourceResult.status === "fulfilled") {
      data = summarizePublicSourceHealth(sourceResult.value);
    }
  }

  return {
    service: "frederick-radius",
    status:
      database.status === "reachable" && data.status === "current"
        ? "operational"
        : "degraded",
    generatedAt,
    deployment: {
      environment: deploymentEnvironment(dependencies.environment),
      revision: publicRevision(dependencies.revision),
    },
    database,
    data,
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
