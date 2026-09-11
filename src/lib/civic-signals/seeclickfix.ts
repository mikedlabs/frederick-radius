import type {
  CivicDataQuality,
  CivicFact,
  CivicRejectionReason,
  CivicSignal,
  CivicSignalAnalysis,
  CivicSourceHealth,
  CivicSourceRef,
  CivicTimeWindow,
} from "./contracts";

export const SEECLICKFIX_SOURCE: Omit<CivicSourceRef, "observedAt"> = {
  id: "seeclickfix-frederick-county",
  label: "Frederick County FCG FixIt",
  url: "https://www.frederickcountymd.gov/8235/FCG-FixIT",
  authority: "official-service-platform",
  license: "CC BY-NC-SA; vendor review required for substantial reuse",
};

export const MINIMUM_GENERAL_CELL_SIZE = 11;
export const MINIMUM_TREND_DAYS = 28;

const SOURCE_FRESH_HOURS = 36;
const MAX_PUBLISHABLE_SNAPSHOT_AGE_DAYS = 30;

const ROADWAY_CATEGORIES = new Set([
  "Roadway General Request",
  "Roadway Drainage Maintenance",
  "Roadway Pavement Maintenance",
  "Roadway Tree Maintenance",
]);

type SafeSeeClickFixRecord = {
  id: string;
  categoryGroup: "roadway" | "other";
  status: "acknowledged" | "closed" | "other";
  reportedAt: string;
  atMs: number;
};

export type SeeClickFixFeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};

export type AnalyzeSeeClickFixOptions = {
  now?: Date;
  /**
   * A caller may raise the privacy threshold, but cannot lower the product's
   * general-data floor.
   */
  minimumCellSize?: number;
  staleAfterHours?: number;
};

const COUNTY_SCOPE = {
  type: "county",
  id: "frederick-county-md",
  label: "Frederick County",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeDate(value: unknown): { iso: string; ms: number } | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

function acceptedId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value);
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null;
}

function addRejection(
  counts: Partial<Record<CivicRejectionReason, number>>,
  reason: CivicRejectionReason,
): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function normalizeFeature(
  feature: unknown,
  rejections: Partial<Record<CivicRejectionReason, number>>,
): SafeSeeClickFixRecord | null {
  if (!isRecord(feature) || !isRecord(feature.properties)) {
    addRejection(rejections, "invalid-feature");
    return null;
  }

  const props = feature.properties;
  const id = acceptedId(props.external_id);
  if (!id) {
    addRejection(rejections, "invalid-id");
    return null;
  }

  if (props.source !== "seeclickfix") {
    addRejection(rejections, "wrong-source");
    return null;
  }

  if (typeof props.category !== "string" || props.category.trim().length === 0) {
    addRejection(rejections, "missing-category");
    return null;
  }

  const reportedAt = safeDate(props.reported_at);
  if (!reportedAt) {
    addRejection(rejections, "invalid-timestamp");
    return null;
  }

  // Only categorical fields needed by the aggregate rule cross this boundary.
  // `description`, `summary`, `address`, geometry, and issue URLs are never
  // copied into the normalized record.
  return {
    id,
    categoryGroup: ROADWAY_CATEGORIES.has(props.category) ? "roadway" : "other",
    status:
      props.status === "acknowledged" || props.status === "closed"
        ? props.status
        : "other",
    reportedAt: reportedAt.iso,
    atMs: reportedAt.ms,
  };
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function shortUtcDate(ms: number, includeYear: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(ms);
}

function snapshotLabel(startMs: number, endMs: number): string {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const sameDay = utcDateKey(startMs) === utcDateKey(endMs);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth =
    sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameDay) return shortUtcDate(startMs, true);
  if (sameMonth) {
    return `${shortUtcDate(startMs, false)}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${shortUtcDate(startMs, false)}–${shortUtcDate(endMs, true)}`;
  }
  return `${shortUtcDate(startMs, true)}–${shortUtcDate(endMs, true)}`;
}

function asWindow(records: SafeSeeClickFixRecord[]): CivicTimeWindow | null {
  if (records.length === 0) return null;
  const times = records.map((record) => record.atMs);
  const startMs = Math.min(...times);
  const endMs = Math.max(...times);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    label: snapshotLabel(startMs, endMs),
    kind: "snapshot",
  };
}

function emptyQuality(
  minimumCellSize: number,
  inputRecords = 0,
  rejectionCounts: CivicDataQuality["rejectionCounts"] = {},
): CivicDataQuality {
  return {
    grain: "one public service report",
    inputRecords,
    acceptedRecords: 0,
    rejectedRecords: inputRecords,
    duplicateRecords: 0,
    distinctDays: 0,
    minimumCellSize,
    minimumCellMet: false,
    snapshotOnly: true,
    rejectionCounts,
    caveats: [
      "The analyzer did not receive enough valid aggregate records to publish a finding.",
      "No raw report text, addresses, or coordinates are retained.",
    ],
  };
}

function sourceRef(observedAt: string): CivicSourceRef {
  return { ...SEECLICKFIX_SOURCE, observedAt };
}

function unavailableHealth(
  checkedAt: string,
  status: CivicSourceHealth["status"],
  quality: CivicDataQuality,
  note: string,
): CivicSourceHealth {
  return {
    source: sourceRef(checkedAt),
    status,
    checkedAt,
    lastObservedAt: null,
    acceptedRecords: quality.acceptedRecords,
    rejectedRecords: quality.rejectedRecords,
    duplicateRecords: quality.duplicateRecords,
    window: null,
    note,
  };
}

/**
 * Reduce a SeeClickFix FeatureCollection into aggregate, countywide evidence.
 *
 * This is a snapshot rule. It never compares periods, calls a short window a
 * trend, ranks neighborhoods, or exposes individual reports.
 */
export function analyzeSeeClickFixSnapshot(
  input: unknown,
  options: AnalyzeSeeClickFixOptions = {},
): CivicSignalAnalysis {
  const now = options.now ?? new Date();
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const generatedAt = new Date(nowMs).toISOString();
  const minimumCellSize = Math.max(
    MINIMUM_GENERAL_CELL_SIZE,
    Math.floor(options.minimumCellSize ?? MINIMUM_GENERAL_CELL_SIZE),
  );

  if (
    !isRecord(input) ||
    input.type !== "FeatureCollection" ||
    !Array.isArray(input.features)
  ) {
    const rejectionCounts = { "invalid-collection": 1 } as const;
    const quality = emptyQuality(minimumCellSize, 0, rejectionCounts);
    return {
      generatedAt,
      signals: [],
      facts: [],
      sourceHealth: [
        unavailableHealth(
          generatedAt,
          "invalid",
          quality,
          "The saved source file could not be validated.",
        ),
      ],
      quality,
    };
  }

  const rejections: Partial<Record<CivicRejectionReason, number>> = {};
  const normalized: SafeSeeClickFixRecord[] = [];
  const ids = new Set<string>();
  let duplicates = 0;

  for (const feature of input.features) {
    const record = normalizeFeature(feature, rejections);
    if (!record) continue;
    if (ids.has(record.id)) {
      duplicates += 1;
      addRejection(rejections, "duplicate-id");
      continue;
    }
    ids.add(record.id);
    normalized.push(record);
  }

  const window = asWindow(normalized);
  const rejectedRecords = input.features.length - normalized.length;
  const distinctDays = new Set(
    normalized.map((record) => utcDateKey(record.atMs)),
  ).size;
  const quality: CivicDataQuality = {
    grain: "one public service report",
    inputRecords: input.features.length,
    acceptedRecords: normalized.length,
    rejectedRecords,
    duplicateRecords: duplicates,
    distinctDays,
    minimumCellSize,
    minimumCellMet: normalized.length >= minimumCellSize,
    snapshotOnly: true,
    rejectionCounts: rejections,
    caveats: [
      "The saved file contains one fetched page, not a complete period or long-term trend.",
      "No raw report text, addresses, or coordinates are retained.",
      `Trend rules remain disabled until at least ${MINIMUM_TREND_DAYS} distinct days pass separate comparability checks.`,
    ],
  };

  if (!window) {
    return {
      generatedAt,
      signals: [],
      facts: [],
      sourceHealth: [
        unavailableHealth(
          generatedAt,
          "insufficient",
          quality,
          "No valid aggregate records were available.",
        ),
      ],
      quality,
    };
  }

  const lastObservedAt = window.end;
  const observedMs = Date.parse(lastObservedAt);
  const source = sourceRef(lastObservedAt);
  const staleAfterMs =
    Math.max(1, options.staleAfterHours ?? SOURCE_FRESH_HOURS) * 60 * 60 * 1000;
  const ageMs = Math.max(0, nowMs - observedMs);
  const sourceStatus: CivicSourceHealth["status"] =
    normalized.length < minimumCellSize
      ? "insufficient"
      : ageMs > staleAfterMs
        ? "stale"
        : "ready";
  const health: CivicSourceHealth = {
    source,
    status: sourceStatus,
    checkedAt: generatedAt,
    lastObservedAt,
    acceptedRecords: normalized.length,
    rejectedRecords,
    duplicateRecords: duplicates,
    window,
    note:
      sourceStatus === "ready"
        ? "The source has enough recent aggregate records for snapshot findings."
        : sourceStatus === "stale"
          ? "The snapshot is dated and must not be described as live."
          : "The source does not meet the minimum public cell size.",
  };

  if (normalized.length < minimumCellSize) {
    return {
      generatedAt,
      signals: [],
      facts: [],
      sourceHealth: [health],
      quality,
    };
  }

  const snapshotExpiresAt = new Date(
    observedMs + MAX_PUBLISHABLE_SNAPSHOT_AGE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const withinPublicationWindow = nowMs <= Date.parse(snapshotExpiresAt);
  const roadwayCount = normalized.filter(
    (record) => record.categoryGroup === "roadway",
  ).length;
  const acknowledgedCount = normalized.filter(
    (record) => record.status === "acknowledged",
  ).length;

  const factCaveats = [
    "These are public requests for service, not confirmed conditions.",
    "The source window is a snapshot and cannot establish a trend.",
  ];
  const totalFact: CivicFact = {
    id: `fixit-total-${window.start.slice(0, 10)}-${window.end.slice(0, 10)}`,
    topic: "public-services",
    metricId: "fixit.report-count",
    label: "Public service reports in snapshot",
    value: normalized.length,
    unit: "count",
    scope: COUNTY_SCOPE,
    window,
    sampleSize: normalized.length,
    sensitivity: "general",
    aggregation: "aggregate",
    source,
    generatedAt,
    caveats: factCaveats,
  };
  const roadwayFact: CivicFact = {
      id: `fixit-roadway-${window.start.slice(0, 10)}-${window.end.slice(0, 10)}`,
      topic: "transportation",
      metricId: "fixit.roadway-report-count",
      label: "Roadway-related reports",
      value: roadwayCount,
      unit: "count",
      scope: COUNTY_SCOPE,
      window,
      sampleSize: normalized.length,
      sensitivity: "general",
      aggregation: "aggregate",
      source,
      generatedAt,
      caveats: factCaveats,
    };
  const acknowledgedFact: CivicFact = {
      id: `fixit-acknowledged-${window.start.slice(0, 10)}-${window.end.slice(0, 10)}`,
      topic: "public-services",
      metricId: "fixit.acknowledged-report-count",
      label: "Reports marked acknowledged",
      value: acknowledgedCount,
      unit: "count",
      scope: COUNTY_SCOPE,
      window,
      sampleSize: normalized.length,
      sensitivity: "general",
      aggregation: "aggregate",
      source,
      generatedAt,
      caveats: [
        ...factCaveats,
        "An acknowledged status does not prove that work is complete.",
      ],
    };

  // Publishing a numerator and total also reveals the remainder. Both cells
  // therefore have to pass the same privacy floor.
  const facts: CivicFact[] = [totalFact];
  const roadwayRemainder = normalized.length - roadwayCount;
  if (
    roadwayCount >= minimumCellSize &&
    roadwayRemainder >= minimumCellSize
  ) {
    facts.push(roadwayFact);
  }
  const acknowledgedRemainder = normalized.length - acknowledgedCount;
  if (
    acknowledgedCount >= minimumCellSize &&
    acknowledgedRemainder >= minimumCellSize
  ) {
    facts.push(acknowledgedFact);
  }

  const canPublishSnapshot =
    withinPublicationWindow && normalized.length >= minimumCellSize;
  const canPublishRoadwayComposition =
    withinPublicationWindow &&
    roadwayCount >= minimumCellSize &&
    roadwayRemainder >= minimumCellSize &&
    roadwayCount > normalized.length / 2;

  const signals: CivicSignal[] = [];
  if (canPublishSnapshot) {
    signals.push({
      id: `fixit-snapshot-${window.start.slice(0, 10)}-${window.end.slice(0, 10)}`,
      topic: "public-services",
      scope: COUNTY_SCOPE,
      title: `The saved file contains ${normalized.length} recent service reports`,
      statement: `These are the latest records in one fetched Frederick County FCG FixIt page, submitted from ${window.label}.`,
      whyItMatters:
        "This confirms what the saved page covers. It does not measure every request from those dates, compare neighborhoods, or establish a change over time.",
      comparison: {
        kind: "snapshot-count",
        label: "Accepted reports in the saved snapshot",
        current: normalized.length,
        unit: "count",
      },
      window,
      confidence: "medium",
      sensitivity: "general",
      publicationStatus: "published",
      generatedAt,
      expiresAt: snapshotExpiresAt,
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
          observedAt: lastObservedAt,
          window,
          sampleSize: totalFact.sampleSize,
          precision: COUNTY_SCOPE.type,
        },
      ],
      method: {
        ruleId: "fixit-snapshot-volume",
        version: 1,
        summary:
          "Count unique, valid countywide reports and publish only when the aggregate cell is at least 11 and the dated snapshot is no more than 30 days old.",
      },
      actions: [
        {
          label: "Open Frederick County FCG FixIt",
          href: SEECLICKFIX_SOURCE.url,
        },
      ],
    });
  }

  if (canPublishRoadwayComposition) {
    signals.push(
        {
          id: `fixit-roadway-share-${window.start.slice(0, 10)}-${window.end.slice(0, 10)}`,
          topic: "transportation",
          scope: COUNTY_SCOPE,
          title: "Road requests made up most of this snapshot",
          statement: `${roadwayCount} of ${normalized.length} public service reports in the ${window.label} snapshot concerned roadway maintenance or a general road request.`,
          whyItMatters:
            "This shows what residents reported to the county during this short window. It does not measure total need or how quickly work was completed.",
          comparison: {
            kind: "composition",
            label: "Roadway reports out of all accepted reports",
            current: roadwayCount,
            baseline: normalized.length,
            unit: "count",
          },
          window,
          confidence: "medium",
          sensitivity: "general",
          publicationStatus: "published",
          generatedAt,
          expiresAt: snapshotExpiresAt,
          caveats: [
            "This is one dated page of public reports, not a complete period, live queue, or long-term trend.",
            "A request for service is not proof that a condition was confirmed.",
            "Counts are countywide. Addresses and report text are intentionally withheld.",
          ],
          evidence: [
            {
              factId: roadwayFact.id,
              role: "numerator",
              label: roadwayFact.label,
              value: roadwayFact.value,
              unit: roadwayFact.unit,
              source,
              observedAt: lastObservedAt,
              window,
              sampleSize: roadwayFact.sampleSize,
              precision: COUNTY_SCOPE.type,
            },
            {
              factId: totalFact.id,
              role: "denominator",
              label: totalFact.label,
              value: totalFact.value,
              unit: totalFact.unit,
              source,
              observedAt: lastObservedAt,
              window,
              sampleSize: totalFact.sampleSize,
              precision: COUNTY_SCOPE.type,
            },
          ],
          method: {
            ruleId: "fixit-roadway-composition",
            version: 1,
            summary:
              "Count accepted countywide reports in four reviewed roadway categories and publish only when the roadway cell is at least 11 and exceeds half of the accepted snapshot.",
          },
          actions: [
            {
              label: "Open Frederick County FCG FixIt",
              href: SEECLICKFIX_SOURCE.url,
            },
          ],
        },
      );
  }

  return {
    generatedAt,
    signals,
    facts,
    sourceHealth: [health],
    quality,
  };
}
