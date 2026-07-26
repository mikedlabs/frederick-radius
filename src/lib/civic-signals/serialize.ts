import type {
  CivicSignal,
  CivicSignalAnalysis,
  PublicCivicSignal,
  PublicCivicSignalsPayload,
  PublicCivicSourceHealth,
} from "./contracts";

export type SerializeCivicSignalOptions = {
  now?: Date;
};

const ADDRESS_PATTERN =
  /\b\d{1,6}\s+(?:[A-Za-z.'-]+\s+){0,5}(?:Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Ln|Lane|Ct|Court|Pike|Blvd|Boulevard|Hwy|Highway)\b/i;
const COORDINATE_PAIR_PATTERN =
  /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN =
  /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/;

function hasRestrictedText(value: string): boolean {
  return (
    ADDRESS_PATTERN.test(value) ||
    COORDINATE_PAIR_PATTERN.test(value) ||
    EMAIL_PATTERN.test(value) ||
    PHONE_PATTERN.test(value)
  );
}

function isAggregateSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /\/issues?\/\d+(?:\/|$)/i.test(url.pathname)
    ) {
      return false;
    }
    const restrictedParams = [
      "address",
      "lat",
      "lng",
      "latitude",
      "longitude",
      "external_id",
      "case_id",
      "incident_id",
      "report_id",
    ];
    return restrictedParams.every((param) => !url.searchParams.has(param));
  } catch {
    return false;
  }
}

function allPublicText(signal: CivicSignal): string[] {
  return [
    signal.scope.label,
    signal.window.label,
    signal.title,
    signal.statement,
    signal.whyItMatters,
    ...signal.caveats,
    signal.comparison.label,
    signal.method.summary,
    ...signal.actions.map((action) => action.label),
    ...signal.evidence.map((item) => item.label),
    ...signal.evidence.map((item) => item.source.label),
    ...signal.evidence.map((item) => item.window.label),
  ];
}

/**
 * Convert one internal finding to a strict public whitelist.
 *
 * Unsafe findings are suppressed rather than partially redacted. A partial
 * redaction can change a claim's meaning, while suppression keeps the API
 * honest and makes the failed gate visible in tests/telemetry.
 */
export function serializePublicCivicSignal(
  signal: CivicSignal,
  options: SerializeCivicSignalOptions = {},
): PublicCivicSignal | null {
  const now = options.now ?? new Date();
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();

  if (
    signal.publicationStatus !== "published" ||
    signal.sensitivity !== "general" ||
    !Number.isFinite(Date.parse(signal.expiresAt)) ||
    Date.parse(signal.expiresAt) < nowMs ||
    allPublicText(signal).some(hasRestrictedText) ||
    signal.actions.some((action) => !isAggregateSourceUrl(action.href)) ||
    signal.evidence.some(
      (item) => !isAggregateSourceUrl(item.source.url),
    )
  ) {
    return null;
  }

  return {
    id: signal.id,
    topic: signal.topic,
    scope: { ...signal.scope },
    title: signal.title,
    statement: signal.statement,
    whyItMatters: signal.whyItMatters,
    comparison: { ...signal.comparison },
    window: { ...signal.window },
    confidence: signal.confidence,
    generatedAt: signal.generatedAt,
    expiresAt: signal.expiresAt,
    caveats: [...signal.caveats],
    evidence: signal.evidence.map((item) => ({
      factId: item.factId,
      role: item.role,
      label: item.label,
      value: item.value,
      unit: item.unit,
      source: { ...item.source },
      observedAt: item.observedAt,
      window: { ...item.window },
      sampleSize: item.sampleSize,
      precision: item.precision,
    })),
    method: { ...signal.method },
    actions: signal.actions.map((action) => ({ ...action })),
  };
}

export function serializePublicCivicSignals(
  signals: CivicSignal[],
  options: SerializeCivicSignalOptions = {},
): PublicCivicSignal[] {
  const serialized: PublicCivicSignal[] = [];
  for (const signal of signals) {
    const safe = serializePublicCivicSignal(signal, options);
    if (safe) serialized.push(safe);
  }
  return serialized;
}

function publicSourceHealth(
  health: CivicSignalAnalysis["sourceHealth"][number],
): PublicCivicSourceHealth {
  return {
    source: { ...health.source },
    status: health.status,
    checkedAt: health.checkedAt,
    lastObservedAt: health.lastObservedAt,
    acceptedRecords: health.acceptedRecords,
    rejectedRecords: health.rejectedRecords,
    duplicateRecords: health.duplicateRecords,
    window: health.window ? { ...health.window } : null,
    note: health.note,
  };
}

export function serializePublicCivicSignalsPayload(
  analysis: CivicSignalAnalysis,
  options: SerializeCivicSignalOptions = {},
): PublicCivicSignalsPayload {
  return {
    generatedAt: analysis.generatedAt,
    signals: serializePublicCivicSignals(analysis.signals, options),
    sourceHealth: analysis.sourceHealth.map(publicSourceHealth),
    quality: {
      ...analysis.quality,
      rejectionCounts: { ...analysis.quality.rejectionCounts },
      caveats: [...analysis.quality.caveats],
    },
  };
}
