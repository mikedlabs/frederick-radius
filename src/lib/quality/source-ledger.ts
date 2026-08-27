/**
 * Truthful source-health projection.
 *
 * Configuration, collection, and publication are separate facts. A key in the
 * deployment only means an adapter may run. It does not make a source
 * available. Likewise, an old success cannot hide a newer failed attempt.
 */

export type SourceCollection = "pipeline" | "runtime" | "workflow";
export type SourcePublicationApplicability = "required" | "not_applicable";

export type SourceManifestEntry = {
  id: string;
  name: string;
  owner: string | null;
  url: string | null;
  license: string | null;
  status: string;
  collection: SourceCollection | null;
  refreshCadence: string;
  snapshotCadence: string | null;
  changeCadence: string | null;
  manifestLastSuccess: string | null;
  schemaFile: string | null;
  transformFile: string | null;
  evidenceAliases: string[];
  rowsRequired: boolean;
  /** Whether this source is expected to produce publication evidence. */
  publicationApplicability: SourcePublicationApplicability;
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

/**
 * Stable, machine-readable diagnosis for the row's current state.
 *
 * `state` is the established public/admin compatibility contract. This code
 * adds the missing operational detail, especially for legacy `unknown` rows:
 * an upstream that answered a bounded HTTP check is materially different from
 * a source that has never been observed, even though neither is publication
 * proof.
 */
export type SourceLedgerReasonCode =
  | "upstream_unreachable"
  | "collection_failed"
  | "collection_running"
  | "configuration_missing"
  | "evidence_timestamp_invalid"
  | "publication_stale"
  | "publication_missing"
  | "publication_required_empty"
  | "upstream_reachable_validation_missing"
  | "runtime_validation_missing"
  | "source_not_observed"
  | "publication_empty_valid"
  | "publication_current"
  | "publication_not_applicable"
  | "source_inactive";

export type SourceLedgerRecommendedAction =
  | "retry_upstream"
  | "repair_collection"
  | "inspect_running_collection"
  | "configure_source"
  | "repair_evidence_timestamp"
  | "refresh_publication"
  | "publish_collected_data"
  | "investigate_empty_publication"
  | "record_validation_or_publication"
  | "record_runtime_validation"
  | "run_collection"
  | "none";

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
  publicationApplicability: SourcePublicationApplicability;
  configured: boolean | null;
  keyless: boolean | null;
  missingSettings: string[];
  state: SourceLedgerState;
  available: boolean;
  reason: string;
  reasonCode: SourceLedgerReasonCode;
  recommendedAction: SourceLedgerRecommendedAction;
  /** Freshest valid evidence timestamp of any kind, including reachability. */
  lastObservedAt: string | null;
  /** Reachability is reported separately and never counts as publication. */
  lastReachabilityAt: string | null;
  lastReachabilityOutcome: SourceEvidenceOutcome | null;
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
    reasonCode: SourceLedgerReasonCode;
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
      if (options.reasonCode === "runtime_validation_missing") {
        return "A durable publication does not apply to this bounded on-demand adapter, but no bounded request-time validation evidence is recorded.";
      }
      return options.reasonCode === "upstream_reachable_validation_missing"
        ? "The upstream answered a reachability check, but no validated collection or publication evidence is recorded."
        : "No source observation, validated collection, or publication evidence is recorded.";
    case "healthy_empty":
      return options.reasonCode === "publication_not_applicable"
        ? "The bounded on-demand adapter completed with no matching row. An empty exact lookup is valid and no durable publication applies."
        : "The source answered successfully with no rows. An empty result is valid for this source.";
    case "healthy":
      return options.reasonCode === "publication_not_applicable"
        ? "The bounded on-demand adapter has validation evidence. It returns exact results directly and does not create a durable publication."
        : "The source has current published evidence.";
    case "inactive":
      return `The manifest keeps this source ${options.manifestStatus.replace(/_/g, " ")}.`;
  }
}

function sourceDiagnosis(
  state: SourceLedgerState,
  options: {
    latestAttemptKind: SourceEvidenceKind | null;
    latestReachabilityOutcome: SourceEvidenceOutcome | null;
    publicationApplicability: SourcePublicationApplicability;
    hasPublicationEvidence: boolean;
  },
): {
  reasonCode: SourceLedgerReasonCode;
  recommendedAction: SourceLedgerRecommendedAction;
} {
  switch (state) {
    case "failing":
      return options.latestAttemptKind === "reachability_probe"
        ? {
            reasonCode: "upstream_unreachable",
            recommendedAction: "retry_upstream",
          }
        : {
            reasonCode: "collection_failed",
            recommendedAction: "repair_collection",
          };
    case "running":
      return {
        reasonCode: "collection_running",
        recommendedAction: "inspect_running_collection",
      };
    case "unconfigured":
      return {
        reasonCode: "configuration_missing",
        recommendedAction: "configure_source",
      };
    case "invalid_evidence":
      return {
        reasonCode: "evidence_timestamp_invalid",
        recommendedAction: "repair_evidence_timestamp",
      };
    case "stale":
      return {
        reasonCode: "publication_stale",
        recommendedAction: "refresh_publication",
      };
    case "awaiting_publish":
      return {
        reasonCode: "publication_missing",
        recommendedAction: "publish_collected_data",
      };
    case "required_empty":
      return {
        reasonCode: "publication_required_empty",
        recommendedAction: "investigate_empty_publication",
      };
    case "unknown":
      if (options.publicationApplicability === "not_applicable") {
        return {
          reasonCode: "runtime_validation_missing",
          recommendedAction: "record_runtime_validation",
        };
      }
      return options.latestReachabilityOutcome === "success"
        ? {
            reasonCode: "upstream_reachable_validation_missing",
            recommendedAction: "record_validation_or_publication",
          }
        : {
            reasonCode: "source_not_observed",
            recommendedAction: "run_collection",
          };
    case "healthy_empty":
      return options.publicationApplicability === "not_applicable" &&
        !options.hasPublicationEvidence
        ? {
            reasonCode: "publication_not_applicable",
            recommendedAction: "none",
          }
        : {
            reasonCode: "publication_empty_valid",
            recommendedAction: "none",
          };
    case "healthy":
      return options.publicationApplicability === "not_applicable" &&
        !options.hasPublicationEvidence
        ? {
            reasonCode: "publication_not_applicable",
            recommendedAction: "none",
          }
        : {
            reasonCode: "publication_current",
            recommendedAction: "none",
          };
    case "inactive":
      return {
        reasonCode: "source_inactive",
        recommendedAction: "none",
      };
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
      const publicationRequired =
        source.publicationApplicability === "required";
      const nowMs = now.getTime();
      const futureAttemptObserved = sourceEvidence.some((item) => {
        const attemptedMs = timestamp(item.attemptedAt);
        return (
          attemptedMs !== null
          && attemptedMs > nowMs + MAX_FUTURE_EVIDENCE_SKEW_MS
        );
      });
      // `lastObservedAt` and reachability fields promise valid observations.
      // Keep future-dated evidence available for the invalid-evidence
      // diagnosis, but never project it as the latest real observation.
      const validObservations = sourceEvidence.filter((item) => {
        const attemptedMs = timestamp(item.attemptedAt);
        return (
          attemptedMs !== null
          && attemptedMs <= nowMs + MAX_FUTURE_EVIDENCE_SKEW_MS
        );
      });
      const latestObservation = freshest(
        validObservations,
        (item) => item.attemptedAt,
      );
      const latestReachability = freshest(
        validObservations.filter(
          (item) => item.kind === "reachability_probe",
        ),
        (item) => item.attemptedAt,
      );
      // A successful HTTP reachability check proves only that an upstream
      // endpoint answered. It must not clear a parser/publisher failure or
      // become a collection success. Within the reachability layer, however,
      // only the newest probe is current evidence: a later success must retire
      // an older outage instead of leaving the source permanently failing.
      const stateEvidence = sourceEvidence.filter(
        (item) => {
          // A checked-in manifest success is historical catalog evidence. For
          // a publication-free on-demand adapter it is not a request-time
          // attempt and must never clear an outage or imply live availability.
          if (!publicationRequired && item.kind === "manifest") return false;
          if (item.kind !== "reachability_probe") return true;
          return item === latestReachability && item.outcome !== "success";
        },
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
      // `runtime_probe` evidence enters this projection only through the
      // caller's currentEvidence option. Unlike manifest, database, or bundled
      // artifact evidence, its presence proves that this ledger request ran a
      // bounded adapter validation now instead of trusting a timeless marker.
      const latestRuntimeValidation = freshest(
        successful.filter((item) => item.kind === "runtime_probe"),
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
      const runtimeValidationMs = timestamp(
        latestRuntimeValidation?.succeededAt
          ?? latestRuntimeValidation?.attemptedAt,
      );
      const recoverySuccessMs = publicationRequired
        ? successMs
        : runtimeValidationMs;
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
          value > nowMs + MAX_FUTURE_EVIDENCE_SKEW_MS,
      ) || futureAttemptObserved;
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
        (recoverySuccessMs === null || attemptMs >= recoverySuccessMs)
      ) {
        state = "failing";
      } else if (
        latestAttempt?.outcome === "running" &&
        attemptMs !== null &&
        (recoverySuccessMs === null || attemptMs >= recoverySuccessMs)
      ) {
        state = "running";
      } else if (!publicationRequired && latestRuntimeValidation === null) {
        state = "unknown";
      } else if (
        publicationRequired &&
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
      } else if (
        latestPublished?.recordCount === 0 ||
        (!publicationRequired && latestRuntimeValidation?.recordCount === 0)
      ) {
        state = "healthy_empty";
      } else {
        state = "healthy";
      }

      const diagnosis = sourceDiagnosis(state, {
        latestAttemptKind: latestAttempt?.kind ?? null,
        latestReachabilityOutcome: latestReachability?.outcome ?? null,
        publicationApplicability: source.publicationApplicability,
        hasPublicationEvidence: latestPublished !== null,
      });

      return {
        id: source.id,
        name: source.name,
        owner: source.owner,
        manifestStatus: source.status,
        collection: source.collection,
        publicationApplicability: source.publicationApplicability,
        configured: config?.configured ?? null,
        keyless: config?.keyless ?? null,
        missingSettings: config?.missingSettings ?? [],
        state,
        available: state === "healthy" || state === "healthy_empty",
        reason: sourceReason(state, {
          manifestStatus: source.status,
          missingSettings: config?.missingSettings ?? [],
          error: latestError,
          reasonCode: diagnosis.reasonCode,
        }),
        reasonCode: diagnosis.reasonCode,
        recommendedAction: diagnosis.recommendedAction,
        lastObservedAt: latestObservation?.attemptedAt ?? null,
        lastReachabilityAt: latestReachability?.attemptedAt ?? null,
        lastReachabilityOutcome: latestReachability?.outcome ?? null,
        lastAttemptAt,
        lastAttemptOutcome: latestAttempt?.outcome ?? null,
        lastSuccessAt,
        lastPublishedAt,
        recordCount: publicationRequired
          ? latestPublished?.recordCount ?? latestSuccess?.recordCount ?? null
          : latestRuntimeValidation?.recordCount ?? null,
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
