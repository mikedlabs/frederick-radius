/**
 * Public-data findings that can be inspected, reproduced, and safely shown.
 *
 * These contracts intentionally stop at aggregate geography. Raw records,
 * addresses, coordinates, narrative descriptions, and person-level fields do
 * not belong in this layer.
 */

export type CivicTopic =
  | "public-services"
  | "transportation"
  | "planning"
  | "environment"
  | "public-safety"
  | "government";

export type CivicSensitivity = "general" | "sensitive";

export type CivicScope =
  | {
      type: "county";
      id: "frederick-county-md";
      label: "Frederick County";
    }
  | {
      type: "municipality";
      id: string;
      label: string;
    }
  | {
      type: "census-tract";
      id: string;
      label: string;
    };

export type CivicWindowKind = "snapshot" | "period" | "trend";

export type CivicTimeWindow = {
  start: string;
  end: string;
  label: string;
  kind: CivicWindowKind;
};

export type CivicSourceAuthority =
  | "official"
  | "official-service-platform"
  | "partner"
  | "public";

export type CivicSourceRef = {
  id: string;
  label: string;
  url: string;
  authority: CivicSourceAuthority;
  observedAt: string;
  license: string;
};

export type CivicFactUnit = "count" | "percent" | "rate" | "days" | "minutes";

/**
 * A fact is a single aggregate measurement. It is deliberately boring: the
 * signal rule, not an LLM, decides how facts may be combined and described.
 */
export type CivicFact = {
  id: string;
  topic: CivicTopic;
  metricId: string;
  label: string;
  value: number;
  unit: CivicFactUnit;
  scope: CivicScope;
  window: CivicTimeWindow;
  sampleSize: number;
  sensitivity: CivicSensitivity;
  aggregation: "aggregate";
  source: CivicSourceRef;
  generatedAt: string;
  caveats: string[];
};

export type CivicEvidenceRole = "numerator" | "denominator" | "context";

export type CivicSignalEvidence = {
  factId: string;
  role: CivicEvidenceRole;
  label: string;
  value: number;
  unit: CivicFactUnit;
  source: CivicSourceRef;
  observedAt: string;
  window: CivicTimeWindow;
  sampleSize: number;
  precision: CivicScope["type"];
};

export type CivicComparison =
  | {
      kind: "snapshot-count";
      label: string;
      current: number;
      unit: "count";
    }
  | {
      kind: "composition";
      label: string;
      current: number;
      baseline: number;
      unit: "count";
    }
  | {
      kind: "own-baseline";
      label: string;
      current: number;
      baseline: number;
      unit: CivicFactUnit;
    }
  | {
      kind: "rate";
      label: string;
      current: number;
      baseline: number | null;
      unit: "rate";
    };

export type CivicSignalAction = {
  label: string;
  href: string;
};

export type CivicSignal = {
  id: string;
  topic: CivicTopic;
  scope: CivicScope;
  title: string;
  statement: string;
  whyItMatters: string;
  comparison: CivicComparison;
  window: CivicTimeWindow;
  confidence: "high" | "medium" | "low";
  sensitivity: CivicSensitivity;
  publicationStatus: "draft" | "published" | "suppressed";
  generatedAt: string;
  expiresAt: string;
  caveats: string[];
  evidence: CivicSignalEvidence[];
  method: {
    ruleId: string;
    version: number;
    summary: string;
  };
  actions: CivicSignalAction[];
};

export type CivicSourceHealthStatus =
  | "ready"
  | "stale"
  | "review-required"
  | "insufficient"
  | "invalid"
  | "unavailable";

export type CivicSourceHealth = {
  source: CivicSourceRef;
  status: CivicSourceHealthStatus;
  checkedAt: string;
  lastObservedAt: string | null;
  acceptedRecords: number;
  rejectedRecords: number;
  duplicateRecords: number;
  window: CivicTimeWindow | null;
  note: string;
};

export type CivicRejectionReason =
  | "invalid-collection"
  | "invalid-feature"
  | "invalid-id"
  | "duplicate-id"
  | "missing-category"
  | "invalid-timestamp"
  | "wrong-source";

export type CivicDataQuality = {
  grain: "one public service report";
  inputRecords: number;
  acceptedRecords: number;
  rejectedRecords: number;
  duplicateRecords: number;
  distinctDays: number;
  minimumCellSize: number;
  minimumCellMet: boolean;
  snapshotOnly: true;
  rejectionCounts: Partial<Record<CivicRejectionReason, number>>;
  caveats: string[];
};

export type CivicSignalAnalysis = {
  generatedAt: string;
  signals: CivicSignal[];
  facts: CivicFact[];
  sourceHealth: CivicSourceHealth[];
  quality: CivicDataQuality;
};

/**
 * The whitelisted public representation. There are no raw-record containers
 * and no fields capable of carrying geometry, addresses, issue IDs, or report
 * descriptions.
 */
export type PublicCivicSignal = {
  id: string;
  topic: CivicTopic;
  scope: CivicScope;
  title: string;
  statement: string;
  whyItMatters: string;
  comparison: CivicComparison;
  window: CivicTimeWindow;
  confidence: CivicSignal["confidence"];
  generatedAt: string;
  expiresAt: string;
  caveats: string[];
  evidence: Array<{
    factId: string;
    role: CivicEvidenceRole;
    label: string;
    value: number;
    unit: CivicFactUnit;
    source: CivicSourceRef;
    observedAt: string;
    window: CivicTimeWindow;
    sampleSize: number;
    precision: CivicScope["type"];
  }>;
  method: CivicSignal["method"];
  actions: CivicSignalAction[];
};

export type PublicCivicSourceHealth = {
  source: CivicSourceRef;
  status: CivicSourceHealthStatus;
  checkedAt: string;
  lastObservedAt: string | null;
  acceptedRecords: number;
  rejectedRecords: number;
  duplicateRecords: number;
  window: CivicTimeWindow | null;
  note: string;
};

export type PublicCivicSignalsPayload = {
  generatedAt: string;
  signals: PublicCivicSignal[];
  sourceHealth: PublicCivicSourceHealth[];
  quality: CivicDataQuality;
};
