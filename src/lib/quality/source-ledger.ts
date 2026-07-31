/**
 * Truthful source-health projection.
 *
 * Configuration, collection, and publication are separate facts. A key in the
 * deployment only means an adapter may run. It does not make a source
 * available. Likewise, an old success cannot hide a newer failed attempt.
 */

export type SourceCollection = "pipeline" | "runtime" | "workflow";

export type SourceManifestEntry = {
  id: string;
  name: string;
  owner: string | null;
  status: string;
  collection: SourceCollection | null;
  refreshCadence: string;
  manifestLastSuccess: string | null;
  evidenceAliases: string[];
  rowsRequired: boolean;
};

export type SourceEvidenceKind =
  | "manifest"
  | "feed_snapshot"
  | "ingest_run"
  | "artifact"
  | "runtime_probe"
  | "reachability_probe";

export type SourceEvidenceOutcome = "success" | "failure" | "running";

export type SourceEvidence = {
  /** Manifest id or one of its declared evidence aliases. */
  sourceKey: string;
  kind: SourceEvidenceKind;
  attemptedAt: string;
  outcome: SourceEvidenceOutcome;
  succeededAt?: string | null;
  publishedAt?: string | null;
  recordCount?: number | null;
  error?: string | null;
};

export type SourceConfigurationEvidence = {
  sourceId: string;
  configured: boolean;
  keyless: boolean;
  missingSettings: string[];
};

export type RuntimeProbeResult = {
  events: readonly { source: string }[];
  sources_succeeded: readonly string[];
  sources_failed: readonly string[];
};

export type SourceLedgerState =
  | "failing"
  | "running"
  | "unconfigured"
  | "invalid_evidence"
  | "stale"
  | "awaiting_publish"
  | "required_empty"
  | "unknown"
  | "healthy_empty"
  | "healthy"
  | "inactive";

export type SourceFreshness = {
  state: "current" | "stale" | "not_applicable" | "unknown" | "invalid";
  ageHours: number | null;
  maxAgeHours: number | null;
};

export type SourceLedgerRow = {
  id: string;
  name: string;
  owner: string | null;
  manifestStatus: string;
  collection: SourceCollection | null;
  configured: boolean | null;
  keyless: boolean | null;
  missingSettings: string[];
  state: SourceLedgerState;
  available: boolean;
  reason: string;
  lastAttemptAt: string | null;
  lastAttemptOutcome: SourceEvidenceOutcome | null;
  lastSuccessAt: string | null;
  lastPublishedAt: string | null;
  recordCount: number | null;
  latestError: string | null;
  freshness: SourceFreshness;
  evidenceKinds: SourceEvidenceKind[];
};

/**
 * Turn a live event assembly into source-ledger evidence.
 *
 * The publication count is important: a fresh zero-row response must remain
 * distinguishable from a source that published records. Without this count, a
 * runtime probe could overwrite an older zero-row snapshot and make a
 * `rowsRequired` source look healthy.
 */
export function buildRuntimeProbeEvidence(
  result: RuntimeProbeResult,
  attemptedAt: string,
): SourceEvidence[] {
  if (timestamp(attemptedAt) === null) {
    throw new Error("Runtime probe evidence needs a valid attemptedAt timestamp.");
  }
  const failed = new Set(result.sources_failed);
  const publishedCounts = new Map<string, number>();
  for (const event of result.events) {
    publishedCounts.set(
      event.source,
      (publishedCounts.get(event.source) ?? 0) + 1,
    );
  }

  return [
    ...[...new Set(result.sources_succeeded)]
      .filter((sourceKey) => !failed.has(sourceKey))
      .map((sourceKey): SourceEvidence => ({
        sourceKey,
        kind: "runtime_probe",
        attemptedAt,
        outcome: "success",
        succeededAt: attemptedAt,
        // Runtime event adapters publish by returning their validated rows
        // directly to the shared assembly. There is no later publish job.
        publishedAt: attemptedAt,
        recordCount: publishedCounts.get(sourceKey) ?? 0,
      })),
    ...[...failed].map((sourceKey): SourceEvidence => ({
      sourceKey,
      kind: "runtime_probe",
      attemptedAt,
      outcome: "failure",
      error: "The fresh runtime feed check failed.",
    })),
  ];
}

const MAX_AGE_HOURS: Record<string, number> = {
  realtime: 2,
  hourly: 3,
  daily: 36,
  weekly: 240,
  monthly: 960,
  yearly: 9_600,
};

const STATE_PRIORITY: Record<SourceLedgerState, number> = {
  failing: 0,
  running: 1,
  unconfigured: 2,
  invalid_evidence: 3,
  stale: 4,
  awaiting_publish: 5,
  required_empty: 6,
  unknown: 7,
  healthy_empty: 8,
  healthy: 9,
  inactive: 10,
};
const MAX_FUTURE_EVIDENCE_SKEW_MS = 5 * 60_000;

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanError(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return clean.length > 240 ? `${clean.slice(0, 237)}...` : clean;
}

export function cadenceMaxAgeHours(cadence: string): number | null {
  const normalized = cadence.trim().toLowerCase();
  const key = Object.keys(MAX_AGE_HOURS).find(
    (candidate) =>
      normalized === candidate ||
      normalized.startsWith(`${candidate} `) ||
      normalized.startsWith(`${candidate}(`),
  );
  return key ? MAX_AGE_HOURS[key] : null;
}

function freshest<T>(
  values: T[],
  getAt: (value: T) => string | null | undefined,
): T | null {
  let best: T | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const at = timestamp(getAt(value));
    if (at !== null && at >= bestMs) {
      best = value;
      bestMs = at;
    }
  }
  return best;
}

function sourceReason(
  state: SourceLedgerState,
  options: {
    manifestStatus: string;
    missingSettings: string[];
    error: string | null;
  },
): string {
  switch (state) {
    case "failing":
      return options.error
        ? `The latest attempt failed: ${options.error}`
        : "The latest attempt failed after the last recorded success.";
    case "running":
      return "The latest attempt has started but has not recorded a completion.";
    case "unconfigured":
      return options.missingSettings.length > 0
        ? `Required settings are missing: ${options.missingSettings.join(", ")}.`
        : "This adapter is not configured.";
    case "invalid_evidence":
      return "The latest source evidence has a timestamp more than five minutes in the future.";
    case "stale":
      return "The latest published evidence is older than this source's refresh cadence.";
    case "awaiting_publish":
      return "Collection succeeded, but no matching publication evidence was recorded.";
    case "required_empty":
      return "The source succeeded with no rows, but this source requires records.";
    case "unknown":
      return "No validated collection or publication evidence is recorded.";
    case "healthy_empty":
      return "The source answered successfully with no rows. An empty result is valid for this source.";
    case "healthy":
      return "The source has current published evidence.";
    case "inactive":
      return `The manifest keeps this source ${options.manifestStatus.replace(/_/g, " ")}.`;
  }
}

function freshnessFor(
  publishedAt: string | null,
  cadence: string,
  nowMs: number,
): SourceFreshness {
  const maxAgeHours = cadenceMaxAgeHours(cadence);
  if (maxAgeHours === null) {
    return {
      state: "not_applicable",
      ageHours: publishedAt && timestamp(publishedAt) !== null
        ? Math.max(0, (nowMs - timestamp(publishedAt)!) / 3_600_000)
        : null,
      maxAgeHours: null,
    };
  }
  const publishedMs = timestamp(publishedAt);
  if (publishedMs === null) {
    return { state: "unknown", ageHours: null, maxAgeHours };
  }
  if (publishedMs > nowMs + MAX_FUTURE_EVIDENCE_SKEW_MS) {
    return { state: "invalid", ageHours: null, maxAgeHours };
  }
  const ageHours = Math.max(0, (nowMs - publishedMs) / 3_600_000);
  return {
    state: ageHours > maxAgeHours ? "stale" : "current",
    ageHours,
    maxAgeHours,
  };
}

export function buildSourceLedger(
  manifest: SourceManifestEntry[],
  evidence: SourceEvidence[],
  configuration: SourceConfigurationEvidence[],
  now = new Date(),
): SourceLedgerRow[] {
  const sourceByKey = new Map<string, SourceManifestEntry>();
  for (const source of manifest) {
    for (const key of [source.id, ...source.evidenceAliases]) {
      const existing = sourceByKey.get(key);
      if (existing && existing.id !== source.id) {
        throw new Error(
          `${key}: source evidence key belongs to both ${existing.id} and ${source.id}.`,
        );
      }
      sourceByKey.set(key, source);
    }
  }

  const evidenceBySource = new Map<string, SourceEvidence[]>();
  for (const item of evidence) {
    const source = sourceByKey.get(item.sourceKey);
    if (!source || timestamp(item.attemptedAt) === null) continue;
    const rows = evidenceBySource.get(source.id) ?? [];
    rows.push(item);
    evidenceBySource.set(source.id, rows);
  }
  const configBySource = new Map(
    configuration.map((item) => [item.sourceId, item]),
  );

  return manifest
    .map((source): SourceLedgerRow => {
      const sourceEvidence = evidenceBySource.get(source.id) ?? [];
      const config = configBySource.get(source.id);
      // A successful HTTP reachability check proves only that an upstream
      // endpoint answered. It must not clear a parser/publisher failure or
      // become a collection success. A failed reachability check remains
      // operationally relevant and is allowed to put the source in failing.
      const stateEvidence = sourceEvidence.filter(
        (item) =>
          item.kind !== "reachability_probe" || item.outcome === "failure",
      );
      const latestAttempt = freshest(
        stateEvidence,
        (item) => item.attemptedAt,
      );
      const successful = sourceEvidence.filter(
        (item) =>
          item.outcome === "success" && item.kind !== "reachability_probe",
      );
      const latestSuccess = freshest(
        successful,
        (item) => item.succeededAt ?? item.attemptedAt,
      );
      const published = sourceEvidence.filter(
        (item) => timestamp(item.publishedAt) !== null,
      );
      const latestPublished = freshest(published, (item) => item.publishedAt);
      const lastAttemptAt = latestAttempt?.attemptedAt ?? null;
      const lastSuccessAt = latestSuccess
        ? latestSuccess.succeededAt ?? latestSuccess.attemptedAt
        : null;
      const lastPublishedAt = latestPublished?.publishedAt ?? null;
      const attemptMs = timestamp(lastAttemptAt);
      const successMs = timestamp(lastSuccessAt);
      const publishedMs = timestamp(lastPublishedAt);
      const latestError = cleanError(latestAttempt?.error);
      const freshness = freshnessFor(
        lastPublishedAt,
        source.refreshCadence,
        now.getTime(),
      );

      let state: SourceLedgerState;
      const hasFutureEvidence = [attemptMs, successMs, publishedMs].some(
        (value) =>
          value !== null &&
          value > now.getTime() + MAX_FUTURE_EVIDENCE_SKEW_MS,
      );
      if (source.status !== "active") {
        state = "inactive";
      } else if (config?.configured === false) {
        state = "unconfigured";
      } else if (hasFutureEvidence || freshness.state === "invalid") {
        state = "invalid_evidence";
      } else if (
        latestAttempt &&
        latestAttempt.outcome === "failure" &&
        attemptMs !== null &&
        (successMs === null || attemptMs >= successMs)
      ) {
        state = "failing";
      } else if (
        latestAttempt?.outcome === "running" &&
        attemptMs !== null &&
        (successMs === null || attemptMs >= successMs)
      ) {
        state = "running";
      } else if (
        lastSuccessAt &&
        (publishedMs === null ||
          (successMs !== null && publishedMs < successMs))
      ) {
        state = "awaiting_publish";
      } else if (freshness.state === "stale") {
        state = "stale";
      } else if (
        latestPublished?.recordCount === 0 &&
        source.rowsRequired
      ) {
        state = "required_empty";
      } else if (!latestAttempt && !lastSuccessAt && !lastPublishedAt) {
        state = "unknown";
      } else if (latestPublished?.recordCount === 0) {
        state = "healthy_empty";
      } else {
        state = "healthy";
      }

      return {
        id: source.id,
        name: source.name,
        owner: source.owner,
        manifestStatus: source.status,
        collection: source.collection,
        configured: config?.configured ?? null,
        keyless: config?.keyless ?? null,
        missingSettings: config?.missingSettings ?? [],
        state,
        available: state === "healthy" || state === "healthy_empty",
        reason: sourceReason(state, {
          manifestStatus: source.status,
          missingSettings: config?.missingSettings ?? [],
          error: latestError,
        }),
        lastAttemptAt,
        lastAttemptOutcome: latestAttempt?.outcome ?? null,
        lastSuccessAt,
        lastPublishedAt,
        recordCount: latestPublished?.recordCount ?? latestSuccess?.recordCount ?? null,
        latestError,
        freshness,
        evidenceKinds: [
          ...new Set(sourceEvidence.map((item) => item.kind)),
        ].sort(),
      };
    })
    .sort(
      (a, b) =>
        STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state] ||
        a.name.localeCompare(b.name),
    );
}

export function sourceLedgerNeedsAction(row: SourceLedgerRow): boolean {
  return !["healthy", "healthy_empty", "inactive"].includes(row.state);
}
