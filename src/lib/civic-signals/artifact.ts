import type {
  CivicDataQuality,
  CivicFact,
  CivicSignal,
  CivicSignalAnalysis,
  CivicSourceHealth,
  CivicTimeWindow,
} from "./contracts";
import {
  MINIMUM_GENERAL_CELL_SIZE,
  SEECLICKFIX_SOURCE,
} from "./seeclickfix";

const SOURCE_FRESH_HOURS = 36;
const MAX_PUBLISHABLE_SNAPSHOT_AGE_DAYS = 30;

export type SeeClickFixAggregateArtifact = {
  schemaVersion: 1;
  sourceId: typeof SEECLICKFIX_SOURCE.id;
  methodVersion: 1;
  generatedAt: string;
  window: CivicTimeWindow & { kind: "snapshot" };
  aggregate: {
    inputRecords: number;
    acceptedRecords: number;
    rejectedRecords: number;
    duplicateRecords: number;
    distinctDays: number;
  };
  publication: {
    approved: boolean;
    reviewedAt: string | null;
    approvalBasis: string | null;
    note: string;
  };
};

export type AnalyzeSeeClickFixArtifactOptions = {
  now?: Date;
};

const COUNTY_SCOPE = {
  type: "county",
  id: "frederick-county-md",
  label: "Frederick County",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

const FORBIDDEN_ARTIFACT_KEYS = new Set([
  "features",
  "properties",
  "external_id",
  "issue_id",
  "summary",
  "description",
  "address",
  "geometry",
  "coordinates",
  "latitude",
  "longitude",
  "lat",
  "lng",
]);

function containsForbiddenArtifactKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenArtifactKey);
  }
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_ARTIFACT_KEYS.has(key)) return true;
    if (containsForbiddenArtifactKey(nested)) return true;
  }
  return false;
}

function validWindow(value: unknown): value is SeeClickFixAggregateArtifact["window"] {
  if (!isRecord(value)) return false;
  return (
    value.kind === "snapshot" &&
    validIso(value.start) &&
    validIso(value.end) &&
    Date.parse(value.start) <= Date.parse(value.end) &&
    typeof value.label === "string" &&
    /^[A-Z][a-z]{2} \d{1,2}(?:–(?:[A-Z][a-z]{2} )?\d{1,2})?, \d{4}$/.test(
      value.label,
    )
  );
}

function parseArtifact(value: unknown): SeeClickFixAggregateArtifact | null {
  if (
    !isRecord(value) ||
    containsForbiddenArtifactKey(value) ||
    value.schemaVersion !== 1 ||
    value.sourceId !== SEECLICKFIX_SOURCE.id ||
    value.methodVersion !== 1 ||
    !validIso(value.generatedAt) ||
    !validWindow(value.window) ||
    !isRecord(value.aggregate) ||
    !nonnegativeInteger(value.aggregate.inputRecords) ||
    !nonnegativeInteger(value.aggregate.acceptedRecords) ||
    !nonnegativeInteger(value.aggregate.rejectedRecords) ||
    !nonnegativeInteger(value.aggregate.duplicateRecords) ||
    !nonnegativeInteger(value.aggregate.distinctDays) ||
    value.aggregate.acceptedRecords + value.aggregate.rejectedRecords !==
      value.aggregate.inputRecords ||
    value.aggregate.duplicateRecords > value.aggregate.rejectedRecords ||
    !isRecord(value.publication) ||
    typeof value.publication.approved !== "boolean" ||
    !(
      value.publication.reviewedAt === null ||
      validIso(value.publication.reviewedAt)
    ) ||
    !(
      value.publication.approvalBasis === null ||
      (typeof value.publication.approvalBasis === "string" &&
        value.publication.approvalBasis.trim().length > 0)
    ) ||
    typeof value.publication.note !== "string" ||
    value.publication.note.length === 0 ||
    value.publication.note.length > 240
  ) {
    return null;
  }

  if (
    value.publication.approved &&
    (!value.publication.reviewedAt || !value.publication.approvalBasis)
  ) {
    return null;
  }

  return value as SeeClickFixAggregateArtifact;
}

function emptyQuality(): CivicDataQuality {
  return {
    grain: "one public service report",
    inputRecords: 0,
    acceptedRecords: 0,
    rejectedRecords: 0,
    duplicateRecords: 0,
    distinctDays: 0,
    minimumCellSize: MINIMUM_GENERAL_CELL_SIZE,
    minimumCellMet: false,
    snapshotOnly: true,
    rejectionCounts: { "invalid-collection": 1 },
    caveats: [
      "No deployable aggregate artifact passed validation.",
      "No raw report text, addresses, or coordinates are part of the production artifact.",
    ],
  };
}

function failedAnalysis(
  generatedAt: string,
  status: CivicSourceHealth["status"],
  note: string,
): CivicSignalAnalysis {
  const quality = emptyQuality();
  return {
    generatedAt,
    signals: [],
    facts: [],
    sourceHealth: [
      {
        source: {
          ...SEECLICKFIX_SOURCE,
          observedAt: generatedAt,
        },
        status,
        checkedAt: generatedAt,
        lastObservedAt: null,
        acceptedRecords: 0,
        rejectedRecords: 0,
        duplicateRecords: 0,
        window: null,
        note,
      },
    ],
    quality,
  };
}

/**
 * Turn the tracked aggregate artifact into public evidence.
 *
 * The production artifact contains only counts and a countywide time window.
 * Publication remains fail-closed until the artifact carries a recorded human
 * approval basis. This is separate from freshness: approved evidence can still
 * be too old to publish.
 */
export function analyzeSeeClickFixAggregateArtifact(
  input: unknown,
  options: AnalyzeSeeClickFixArtifactOptions = {},
): CivicSignalAnalysis {
  const now = options.now ?? new Date();
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const generatedAt = new Date(nowMs).toISOString();
  const artifact = parseArtifact(input);
  if (!artifact) {
    return failedAnalysis(
      generatedAt,
      "invalid",
      "The deployable aggregate artifact did not pass validation.",
    );
  }

  const { aggregate, publication, window } = artifact;
  const source = { ...SEECLICKFIX_SOURCE, observedAt: window.end };
  const minimumCellMet =
    aggregate.acceptedRecords >= MINIMUM_GENERAL_CELL_SIZE;
  const quality: CivicDataQuality = {
    grain: "one public service report",
    inputRecords: aggregate.inputRecords,
    acceptedRecords: aggregate.acceptedRecords,
    rejectedRecords: aggregate.rejectedRecords,
    duplicateRecords: aggregate.duplicateRecords,
    distinctDays: aggregate.distinctDays,
    minimumCellSize: MINIMUM_GENERAL_CELL_SIZE,
    minimumCellMet,
    snapshotOnly: true,
    rejectionCounts: {},
    caveats: [
      "The tracked production artifact contains aggregate counts only.",
      "This saved page is a snapshot, not a complete period or long-term trend.",
      "No raw report text, addresses, exact coordinates, or individual issue IDs are deployed.",
    ],
  };

  if (!publication.approved) {
    const pendingQuality: CivicDataQuality = {
      ...quality,
      inputRecords: 0,
      acceptedRecords: 0,
      rejectedRecords: 0,
      duplicateRecords: 0,
      distinctDays: 0,
      minimumCellMet: false,
      caveats: [
        "A deployable aggregate exists, but its values remain withheld until source reuse is approved.",
        "No raw report text, addresses, or coordinates are part of the production artifact.",
      ],
    };
    return {
      generatedAt,
      signals: [],
      facts: [],
      sourceHealth: [
        {
          source: {
            ...SEECLICKFIX_SOURCE,
            observedAt: artifact.generatedAt,
          },
          status: "review-required",
          checkedAt: generatedAt,
          lastObservedAt: null,
          acceptedRecords: 0,
          rejectedRecords: 0,
          duplicateRecords: 0,
          window: null,
          note: "A privacy-safe aggregate artifact is deployed, but publication is paused while source reuse is reviewed.",
        },
      ],
      quality: pendingQuality,
    };
  }

  const ageMs = Math.max(0, nowMs - Date.parse(window.end));
  const fresh = ageMs <= SOURCE_FRESH_HOURS * 60 * 60 * 1000;
  const healthStatus: CivicSourceHealth["status"] = !minimumCellMet
    ? "insufficient"
    : fresh
      ? "ready"
      : "stale";
  const health: CivicSourceHealth = {
    source,
    status: healthStatus,
    checkedAt: generatedAt,
    lastObservedAt: window.end,
    acceptedRecords: aggregate.acceptedRecords,
    rejectedRecords: aggregate.rejectedRecords,
    duplicateRecords: aggregate.duplicateRecords,
    window,
    note:
      healthStatus === "ready"
        ? "The approved aggregate artifact is current enough for a dated snapshot finding."
        : healthStatus === "stale"
          ? "The approved aggregate is dated and must not be described as live."
          : "The approved aggregate does not meet the minimum public cell size.",
  };

  if (!minimumCellMet) {
    return {
      generatedAt,
      signals: [],
      facts: [],
      sourceHealth: [health],
      quality,
    };
  }

  const expiresAt = new Date(
    Date.parse(window.end) +
      MAX_PUBLISHABLE_SNAPSHOT_AGE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  if (nowMs > Date.parse(expiresAt)) {
    return {
      generatedAt,
      signals: [],
      facts: [],
      sourceHealth: [health],
      quality,
    };
  }

  const totalFact: CivicFact = {
    id: `fixit-total-${window.start.slice(0, 10)}-${window.end.slice(0, 10)}`,
    topic: "public-services",
    metricId: "fixit.report-count",
    label: "Public service reports in snapshot",
    value: aggregate.acceptedRecords,
    unit: "count",
    scope: COUNTY_SCOPE,
    window,
    sampleSize: aggregate.acceptedRecords,
    sensitivity: "general",
    aggregation: "aggregate",
    source,
    generatedAt,
    caveats: [
      "These are public requests for service, not confirmed conditions.",
      "The source window is a snapshot and cannot establish a trend.",
    ],
  };
  const signal: CivicSignal = {
    id: `fixit-snapshot-${window.start.slice(0, 10)}-${window.end.slice(0, 10)}`,
    topic: "public-services",
    scope: COUNTY_SCOPE,
    title: `The saved file contains ${aggregate.acceptedRecords} recent service reports`,
    statement: `These are the latest records in one fetched Frederick County FCG FixIt page, submitted from ${window.label}.`,
    whyItMatters:
      "This confirms what the saved page covers. It does not measure every request from those dates, compare neighborhoods, or establish a change over time.",
    comparison: {
      kind: "snapshot-count",
      label: "Accepted reports in the saved snapshot",
      current: aggregate.acceptedRecords,
      unit: "count",
    },
    window,
    confidence: "medium",
    sensitivity: "general",
    publicationStatus: "published",
    generatedAt,
    expiresAt,
    caveats: [
      "This is one dated page of public reports, not a complete period, live queue, or long-term trend.",
      "A request for service is not proof that a condition was confirmed.",
      "Counts are countywide. Addresses and report text are intentionally withheld.",
    ],
    evidence: [
      {
        factId: totalFact.id,
        role: "context",
        label: totalFact.label,
        value: totalFact.value,
        unit: totalFact.unit,
        source,
        observedAt: window.end,
        window,
        sampleSize: totalFact.sampleSize,
        precision: COUNTY_SCOPE.type,
      },
    ],
    method: {
      ruleId: "fixit-aggregate-snapshot-volume",
      version: artifact.methodVersion,
      summary:
        "Publish the tracked countywide aggregate only after recorded reuse approval, a cell of at least 11, schema validation, and a 30-day age gate.",
    },
    actions: [
      {
        label: "Open Frederick County FCG FixIt",
        href: SEECLICKFIX_SOURCE.url,
      },
    ],
  };

  return {
    generatedAt,
    signals: [signal],
    facts: [totalFact],
    sourceHealth: [health],
    quality,
  };
}

export function unavailableSeeClickFixAggregate(
  options: AnalyzeSeeClickFixArtifactOptions = {},
): CivicSignalAnalysis {
  const now = options.now ?? new Date();
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  return failedAnalysis(
    new Date(nowMs).toISOString(),
    "unavailable",
    "No deployable aggregate artifact is available.",
  );
}
