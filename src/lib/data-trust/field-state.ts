/**
 * Small, database-independent contract for field-level truth.
 *
 * PostgreSQL stores the evidence and the current resolution. These helpers
 * keep ingestion keys deterministic and make every reader recalculate
 * freshness from timestamps, so a stored "known" value cannot stay current
 * merely because a refresh job stopped.
 */

export const FIELD_VALUE_STATUSES = [
  "asserted",
  "absent",
  "unavailable",
  "retracted",
] as const;

export type FieldValueStatus = (typeof FIELD_VALUE_STATUSES)[number];

export const FIELD_RESOLUTION_STATUSES = [
  "known",
  "unknown",
  "disputed",
  "retracted",
] as const;

export type FieldResolutionStatus =
  (typeof FIELD_RESOLUTION_STATUSES)[number];

export type ResolvedFieldFreshness =
  | "current"
  | "aging"
  | "stale"
  | "invalid";

export type ResolvedFieldReadState =
  | "known_current"
  | "known_aging"
  | "stale"
  | "unknown"
  | "disputed"
  | "retracted"
  | "invalid";

export type ResolvedFieldRecord<T = unknown> = {
  resolutionStatus: FieldResolutionStatus;
  resolvedValue: T | null;
  confidence: number;
  checkedAt: string | Date | null;
  validUntil: string | Date | null;
};

export type ResolvedFieldAssessment = {
  state: ResolvedFieldReadState;
  usable: boolean;
  freshness: ResolvedFieldFreshness | null;
  reason:
    | "current_evidence"
    | "nearing_expiry"
    | "expired"
    | "no_current_evidence"
    | "conflicting_evidence"
    | "source_retracted"
    | "invalid_contract";
};

const MAX_FUTURE_CHECK_SKEW_MS = 5 * 60_000;
const MIN_AGING_WINDOW_MS = 60 * 60_000;
const AGING_WINDOW_SHARE = 0.2;

function timestamp(value: string | Date | null): number | null {
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function contractKey(value: string, label: string, maxLength: number): string {
  const clean = value.trim();
  if (!clean || clean.length > maxLength) {
    throw new Error(`${label} must contain between 1 and ${maxLength} characters.`);
  }
  return clean;
}

/**
 * Normalize a field path once at an ingest boundary. Dotted paths allow
 * independent evidence for values such as `hours.monday` without flattening
 * every JSON object into unrelated database columns.
 */
export function normalizeFieldName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{0,159}$/.test(normalized)) {
    throw new Error(
      "fieldName must start with a letter and contain only lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  return normalized;
}

export function normalizeEntityKind(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{0,119}$/.test(normalized)) {
    throw new Error(
      "entityKind must start with a letter and contain at most 120 lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  return normalized;
}

/**
 * Deterministic idempotency key for one source observation. The caller owns
 * the content hash; the encoded components prevent delimiter collisions.
 */
export function buildFieldObservationKey(input: {
  datasetVersionKey?: string | null;
  entityKind: string;
  entityKey: string;
  fieldName: string;
  contentHash: string;
}): string {
  const entityKind = normalizeEntityKind(input.entityKind);
  const entityKey = contractKey(input.entityKey, "entityKey", 1000);
  const fieldName = normalizeFieldName(input.fieldName);
  const datasetVersionKey = input.datasetVersionKey
    ? contractKey(input.datasetVersionKey, "datasetVersionKey", 500)
    : "direct";
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) {
    throw new Error("contentHash must be a lowercase SHA-256 hex digest.");
  }

  const key = [
    datasetVersionKey,
    entityKind,
    entityKey,
    fieldName,
    input.contentHash,
  ]
    .map((part) => encodeURIComponent(part))
    .join("|");
  if (key.length > 1500) {
    throw new Error("The encoded observation key exceeds the database limit.");
  }
  return key;
}

/**
 * Freshness is derived at read time. `aging` begins during the final 20% of
 * the evidence window, with at least a one-hour warning period.
 */
export function resolvedFieldFreshness(
  input: Pick<ResolvedFieldRecord, "checkedAt" | "validUntil">,
  now: string | Date = new Date(),
): ResolvedFieldFreshness {
  const nowAt = timestamp(now);
  const checkedAt = timestamp(input.checkedAt);
  const validUntil = timestamp(input.validUntil);

  if (
    nowAt === null
    || checkedAt === null
    || validUntil === null
    || checkedAt > nowAt + MAX_FUTURE_CHECK_SKEW_MS
    || validUntil <= checkedAt
  ) {
    return "invalid";
  }
  if (validUntil <= nowAt) return "stale";

  const validityWindow = validUntil - checkedAt;
  const agingWindow = Math.max(
    MIN_AGING_WINDOW_MS,
    validityWindow * AGING_WINDOW_SHARE,
  );
  return validUntil - nowAt <= agingWindow ? "aging" : "current";
}

/**
 * One conservative decision boundary for Today, Ask, place pages, and maps.
 * Unknown, disputed, retracted, expired, and malformed rows are never usable
 * as current facts. In particular, `unknown` never turns into `absent` or
 * "closed" here.
 */
export function assessResolvedField<T>(
  record: ResolvedFieldRecord<T>,
  now: string | Date = new Date(),
): ResolvedFieldAssessment {
  if (record.resolutionStatus === "unknown") {
    return {
      state: "unknown",
      usable: false,
      freshness: null,
      reason: "no_current_evidence",
    };
  }
  if (record.resolutionStatus === "disputed") {
    return {
      state: "disputed",
      usable: false,
      freshness: null,
      reason: "conflicting_evidence",
    };
  }
  if (record.resolutionStatus === "retracted") {
    return {
      state: "retracted",
      usable: false,
      freshness: null,
      reason: "source_retracted",
    };
  }

  if (
    record.resolvedValue === null
    || !Number.isFinite(record.confidence)
    || record.confidence <= 0
    || record.confidence > 1
  ) {
    return {
      state: "invalid",
      usable: false,
      freshness: "invalid",
      reason: "invalid_contract",
    };
  }

  const freshness = resolvedFieldFreshness(record, now);
  if (freshness === "invalid") {
    return {
      state: "invalid",
      usable: false,
      freshness,
      reason: "invalid_contract",
    };
  }
  if (freshness === "stale") {
    return {
      state: "stale",
      usable: false,
      freshness,
      reason: "expired",
    };
  }
  if (freshness === "aging") {
    return {
      state: "known_aging",
      usable: true,
      freshness,
      reason: "nearing_expiry",
    };
  }
  return {
    state: "known_current",
    usable: true,
    freshness,
    reason: "current_evidence",
  };
}
