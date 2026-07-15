import type { Event } from "@/data/events";
import type { SourceConfidence } from "@/lib/provenance";

/**
 * Deterministic local impact engine.
 *
 * This module deliberately owns no fetching, caching, geolocation, storage,
 * or rendering. Callers normalize facts at the boundary, pass an explicit
 * clock, and receive either a fully sourced action card or a suppression.
 *
 * Trust rule: a fact is usable only when it is explicitly verified, comes
 * from a reviewed/authoritative confidence tier, and has not passed its
 * caller-supplied freshness deadline. There are no implicit TTLs and no
 * fallback to stale data.
 */

export type ImpactConfidence = SourceConfidence | "unverified";

export type ImpactEvidence = {
  sourceLabel: string;
  sourceUrl?: string | null;
  /** When the source last asserted or verified this fact. */
  observedAt: string;
  /** Caller-owned TTL. The fact is rejected after this instant. */
  freshUntil: string;
  confidence: ImpactConfidence;
  verified: boolean;
};

export type ImpactPrimaryItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  status?: "scheduled" | "cancelled" | "postponed";
  /** A cancellation/postponement notice may have fresher provenance than the event row. */
  statusEvidence?: ImpactEvidence;
  venueName?: string;
  href?: string;
  evidence: ImpactEvidence;
};

export type ImpactSeverity = "info" | "caution" | "severe" | "critical";

export type WeatherImpactSignal = {
  id: string;
  kind: "weather";
  condition:
    | "rain"
    | "thunderstorm"
    | "snow"
    | "ice"
    | "wind"
    | "heat"
    | "cold"
    | "fog";
  startsAt: string;
  endsAt: string;
  probabilityPercent?: number;
  evidence: ImpactEvidence;
};

export type AlertImpactSignal = {
  id: string;
  kind: "alert";
  headline: string;
  severity: ImpactSeverity;
  startsAt: string;
  endsAt: string;
  evidence: ImpactEvidence;
};

export type ClosureImpactSignal = {
  id: string;
  kind: "closure";
  name: string;
  target: "venue" | "route" | "parking" | "transit";
  status: "closed" | "restricted" | "delayed";
  startsAt: string;
  endsAt: string;
  /** A source-provided detour/instruction, never an engine guess. */
  detour?: string;
  evidence: ImpactEvidence;
};

export type ImpactSignal =
  | WeatherImpactSignal
  | AlertImpactSignal
  | ClosureImpactSignal;

export type ImpactTravelPlan = {
  mode: "walk" | "drive" | "bike" | "transit";
  /** Current source-backed door-to-door estimate. */
  durationMinutes: number;
  /** Time to park, enter, or get settled before the primary item starts. */
  arriveEarlyMinutes?: number;
  /** Optional source-backed delay relative to a normal trip. */
  delayMinutes?: number;
  evidence: ImpactEvidence;
};

export type ImpactParkingAlternative = {
  id: string;
  name: string;
  href?: string;
  walkMinutes?: number;
  status?: "available" | "unknown";
  /** When omitted, the parent parking snapshot's evidence applies. */
  evidence?: ImpactEvidence;
};

export type ImpactParkingPlan = {
  id: string;
  name: string;
  /** `recommended` is predictive/editorial and never implies live availability. */
  status: "recommended" | "available" | "filling" | "full";
  href?: string;
  alternatives?: ImpactParkingAlternative[];
  evidence: ImpactEvidence;
};

export type ImpactNearbyAlternative = {
  id: string;
  title: string;
  href?: string;
  indoor?: boolean;
  travelMinutes?: number;
  /** Must be source-verified for the primary window before it can be a backup. */
  availability: "available" | "unknown";
  evidence: ImpactEvidence;
};

export type ImpactEngineInput = {
  /** ISO timestamp; the engine never reads the system clock. */
  now: string;
  primary: ImpactPrimaryItem;
  signals?: ImpactSignal[];
  travel?: ImpactTravelPlan;
  parking?: ImpactParkingPlan;
  nearbyAlternatives?: ImpactNearbyAlternative[];
  /** Used only to format a human leave-by label. */
  timeZone?: string;
};

export type ImpactSource = {
  label: string;
  url: string | null;
  observedAt: string;
  freshUntil: string;
  confidence: Exclude<ImpactConfidence, "unverified" | "scraped">;
};

export type ImpactFact = {
  id: string;
  kind: "status" | ImpactSignal["kind"] | "travel" | "parking";
  severity: ImpactSeverity;
  summary: string;
  sourceLabel: string;
};

export type ImpactAction = {
  label: string;
  href?: string;
};

export type ImpactBackup = ImpactAction & {
  kind: "nearby" | "parking" | "detour";
  itemId?: string;
};

export type ImpactActionCard = {
  id: string;
  primary: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    href?: string;
  };
  urgency: ImpactSeverity;
  confidence: "high" | "medium";
  /** Current plan-changing condition; not a claim that a prior snapshot differed. */
  whatChanged: string;
  whyItMatters: string;
  nextAction: ImpactAction;
  backup: ImpactBackup | null;
  /** ISO instant, present only when a trusted travel estimate is usable. */
  leaveAt: string | null;
  facts: ImpactFact[];
  sources: ImpactSource[];
  generatedAt: string;
};

export type ImpactRejectionReason =
  | "invalid"
  | "unverified"
  | "stale"
  | "irrelevant"
  | "not-actionable";

export type ImpactRejection = {
  input: "signal" | "travel" | "parking" | "nearby-alternative";
  id: string;
  reason: ImpactRejectionReason;
};

export type ImpactSuppressionReason =
  | "invalid-now"
  | "invalid-primary"
  | "primary-unverified"
  | "primary-stale"
  | "status-unverified"
  | "status-stale"
  | "primary-ended"
  | "no-actionable-facts";

export type ImpactEngineResult =
  | { status: "ready"; card: ImpactActionCard; rejections: ImpactRejection[] }
  | {
      status: "suppressed";
      reason: ImpactSuppressionReason;
      rejections: ImpactRejection[];
    };

export type EventImpactAdapterOptions = {
  sourceLabel: string;
  confidence: ImpactConfidence;
  /** Explicit because event freshness policy belongs to the caller/source. */
  freshUntil: string;
  href?: string;
  /**
   * Explicit source-boundary override for official/partner rows whose legacy
   * Event.is_verified flag is false. Callers must derive this from provenance,
   * never from the event copy itself.
   */
  verified?: boolean;
  statusEvidence?: ImpactEvidence;
};

/** Normalize the repository's Event contract without weakening its trust flag. */
export function impactPrimaryFromEvent(
  event: Pick<
    Event,
    | "slug"
    | "title"
    | "starts_at"
    | "ends_at"
    | "status"
    | "venue_name"
    | "source_url"
    | "is_verified"
    | "last_verified_at"
  >,
  options: EventImpactAdapterOptions,
): ImpactPrimaryItem {
  return {
    id: event.slug,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    status: event.status ?? "scheduled",
    statusEvidence: options.statusEvidence,
    venueName: event.venue_name,
    href: options.href,
    evidence: {
      sourceLabel: options.sourceLabel,
      sourceUrl: event.source_url,
      observedAt: event.last_verified_at ?? "",
      freshUntil: options.freshUntil,
      confidence: options.confidence,
      verified: options.verified ?? event.is_verified,
    },
  };
}

const TRUSTED_CONFIDENCE = new Set<ImpactConfidence>([
  "curated",
  "partner",
  "verified",
]);
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const MIN_ACTIONABLE_WEATHER_PROBABILITY = 40;
const MAX_FACTS = 3;

type EvidenceState = "ok" | "invalid" | "unverified" | "stale";

type Candidate = {
  id: string;
  kind: ImpactFact["kind"];
  priority: number;
  severity: ImpactSeverity;
  summary: string;
  why: string;
  action: ImpactAction;
  evidence: ImpactEvidence;
};

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value: unknown, max = 140): string {
  const compact = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function withPeriod(value: string): string {
  const text = clean(value);
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function evidenceState(evidence: ImpactEvidence, nowMs: number): EvidenceState {
  if (!evidence || !clean(evidence.sourceLabel)) return "invalid";
  if (!evidence.verified || !TRUSTED_CONFIDENCE.has(evidence.confidence)) {
    return "unverified";
  }
  const observedAt = parseTime(evidence.observedAt);
  const freshUntil = parseTime(evidence.freshUntil);
  if (
    observedAt === null ||
    freshUntil === null ||
    freshUntil < observedAt ||
    observedAt > nowMs + MAX_CLOCK_SKEW_MS
  ) {
    return "invalid";
  }
  if (nowMs > freshUntil) return "stale";
  return "ok";
}

function intervalsOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  // Treat timed windows as half-open so a closure ending exactly when the
  // trip begins is not reported as an impact. A primary with no end is a
  // point-in-time check instead.
  if (rightStart === rightEnd) return leftStart <= rightStart && rightStart < leftEnd;
  return leftStart < rightEnd && rightStart < leftEnd;
}

function signalWindowIsRelevant(
  startsAt: string,
  endsAt: string,
  primaryStart: number,
  primaryEnd: number,
  nowMs: number,
): "ok" | "invalid" | "irrelevant" {
  const start = parseTime(startsAt);
  const end = parseTime(endsAt);
  if (start === null || end === null || end < start) return "invalid";
  if (end <= nowMs || !intervalsOverlap(start, end, primaryStart, primaryEnd)) {
    return "irrelevant";
  }
  return "ok";
}

function weatherSeverity(condition: WeatherImpactSignal["condition"]): {
  severity: ImpactSeverity;
  priority: number;
} {
  if (condition === "thunderstorm" || condition === "ice") {
    return { severity: "severe", priority: 84 };
  }
  if (["snow", "heat", "cold", "wind"].includes(condition)) {
    return { severity: "caution", priority: 56 };
  }
  return { severity: "caution", priority: condition === "rain" ? 48 : 40 };
}

function weatherLabel(condition: WeatherImpactSignal["condition"]): string {
  switch (condition) {
    case "thunderstorm":
      return "Thunderstorms";
    case "ice":
      return "Icy conditions";
    case "snow":
      return "Snow";
    case "heat":
      return "High heat";
    case "cold":
      return "Dangerous cold";
    case "wind":
      return "Strong wind";
    case "fog":
      return "Fog";
    default:
      return "Rain";
  }
}

function weatherAction(condition: WeatherImpactSignal["condition"]): string {
  switch (condition) {
    case "thunderstorm":
    case "ice":
      return "Recheck official conditions and the event status before leaving.";
    case "snow":
      return "Check road conditions and the event status before leaving.";
    case "heat":
      return "Bring water and limit time in the heat.";
    case "cold":
      return "Dress for the cold and limit outdoor exposure.";
    case "wind":
      return "Secure loose items and check for event changes.";
    case "fog":
      return "Allow extra travel time and use low-beam headlights.";
    default:
      return "Bring rain gear and recheck the event status before leaving.";
  }
}

function candidateForSignal(
  signal: ImpactSignal,
  primary: ImpactPrimaryItem,
): Candidate | null {
  if (signal.kind === "weather") {
    const probability = signal.probabilityPercent;
    if (
      probability !== undefined &&
      (!Number.isFinite(probability) || probability < 0 || probability > 100)
    ) {
      return null;
    }
    if (probability !== undefined && probability < MIN_ACTIONABLE_WEATHER_PROBABILITY) {
      return null;
    }
    const label = weatherLabel(signal.condition);
    const chance = probability === undefined ? "" : `${Math.round(probability)}% chance of `;
    const summary = `${chance}${label.toLowerCase()} during ${clean(primary.title, 80)}.`;
    const rank = weatherSeverity(signal.condition);
    return {
      id: signal.id,
      kind: "weather",
      ...rank,
      summary,
      why: `The forecast overlaps the event window.`,
      action: {
        label: weatherAction(signal.condition),
        ...(signal.evidence.sourceUrl ? { href: signal.evidence.sourceUrl } : {}),
      },
      evidence: signal.evidence,
    };
  }

  if (signal.kind === "alert") {
    if (!clean(signal.headline)) return null;
    const priority =
      signal.severity === "critical"
        ? 94
        : signal.severity === "severe"
          ? 88
          : signal.severity === "caution"
            ? 68
            : 45;
    const severe = signal.severity === "critical" || signal.severity === "severe";
    return {
      id: signal.id,
      kind: "alert",
      priority,
      severity: signal.severity,
      summary: `${clean(signal.headline, 100)} overlaps ${clean(primary.title, 70)}.`,
      why: `An official ${signal.severity} alert is active during the event window.`,
      action: {
        label: severe
          ? "Follow the official alert guidance before traveling."
          : "Read the official alert before leaving.",
        ...(signal.evidence.sourceUrl ? { href: signal.evidence.sourceUrl } : {}),
      },
      evidence: signal.evidence,
    };
  }

  if (!clean(signal.name)) return null;
  const isClosed = signal.status === "closed";
  const venueClosed = signal.target === "venue" && isClosed;
  const priority = venueClosed
    ? 90
    : isClosed
      ? 74
      : signal.status === "restricted"
        ? 62
        : 52;
  const severity: ImpactSeverity = venueClosed
    ? "severe"
    : isClosed || signal.status === "restricted"
      ? "caution"
      : "info";
  const target = signal.target === "venue" ? "venue" : signal.target;
  const summary =
    signal.target === "venue"
      ? `${clean(signal.name, 90)} is ${signal.status} during ${clean(primary.title, 70)}.`
      : `${clean(signal.name, 90)} is ${signal.status} during your trip to ${clean(primary.title, 70)}.`;
  const actionLabel = venueClosed
    ? "Check the organizer before making the trip."
    : signal.detour
      ? "Use the published detour and allow extra time."
      : `Check the ${target} and allow extra time.`;
  return {
    id: signal.id,
    kind: "closure",
    priority,
    severity,
    summary,
    why:
      signal.target === "venue"
        ? `The reported venue disruption overlaps the event window.`
        : `It may affect the trip to ${clean(primary.title, 80)}.`,
    action: {
      label: withPeriod(actionLabel),
      ...(signal.evidence.sourceUrl ? { href: signal.evidence.sourceUrl } : {}),
    },
    evidence: signal.evidence,
  };
}

function travelCandidate(
  travel: ImpactTravelPlan,
  primary: ImpactPrimaryItem,
): Candidate | null {
  const duration = travel.durationMinutes;
  const early = travel.arriveEarlyMinutes ?? 0;
  const delay = travel.delayMinutes ?? 0;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(early) ||
    early < 0 ||
    !Number.isFinite(delay) ||
    delay < 0
  ) {
    return null;
  }
  const mode =
    travel.mode === "drive"
      ? "Driving"
      : travel.mode === "walk"
        ? "Walking"
        : travel.mode === "bike"
          ? "Biking"
          : "Transit";
  return {
    id: `travel:${primary.id}`,
    kind: "travel",
    priority: delay > 0 ? 46 : 28,
    severity: delay >= 15 ? "caution" : "info",
    summary: `${mode} takes about ${Math.round(duration)} minutes${delay > 0 ? `, including a ${Math.round(delay)}-minute delay` : ""}.`,
    why:
      early > 0
        ? `Leaving early gives you ${Math.round(early)} minutes to park or get settled.`
        : `That is the current source-backed trip estimate.`,
    action: { label: "Leave in time to arrive before it starts." },
    evidence: travel.evidence,
  };
}

function parkingCandidate(
  parking: ImpactParkingPlan,
  primary: ImpactPrimaryItem,
): Candidate {
  const statusText =
    parking.status === "full"
      ? "is full"
      : parking.status === "filling"
        ? "is filling up"
        : parking.status === "available"
          ? "has reported availability"
          : "is the suggested parking option";
  const severity: ImpactSeverity =
    parking.status === "full"
      ? "severe"
      : parking.status === "filling"
        ? "caution"
        : "info";
  return {
    id: parking.id,
    kind: "parking",
    priority:
      parking.status === "full"
        ? 78
        : parking.status === "filling"
          ? 44
          : parking.status === "available"
            ? 24
            : 22,
    severity,
    summary: `${clean(parking.name, 90)} ${statusText}.`,
    why: `It is the supplied parking plan for ${clean(primary.title, 80)}.`,
    action: {
      label:
        parking.status === "full"
          ? "Choose a verified parking alternative before leaving."
          : `Plan to use ${clean(parking.name, 90)}.`,
      ...(parking.href ? { href: parking.href } : {}),
    },
    evidence: parking.evidence,
  };
}

function leaveAtFor(
  primaryStart: number,
  nowMs: number,
  travel: ImpactTravelPlan | undefined,
): number | null {
  if (!travel) return null;
  const duration = travel.durationMinutes;
  const early = travel.arriveEarlyMinutes ?? 0;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(early) || early < 0) {
    return null;
  }
  const leaveAt = primaryStart - (duration + early) * 60_000;
  return leaveAt > nowMs ? leaveAt : null;
}

function formatTime(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(11, 16) + " UTC";
  }
}

function sourceFromEvidence(evidence: ImpactEvidence): ImpactSource {
  return {
    label: clean(evidence.sourceLabel, 80),
    url: evidence.sourceUrl ?? null,
    observedAt: evidence.observedAt,
    freshUntil: evidence.freshUntil,
    confidence: evidence.confidence as ImpactSource["confidence"],
  };
}

function uniqueSources(evidence: ImpactEvidence[]): ImpactSource[] {
  const seen = new Set<string>();
  const sources: ImpactSource[] = [];
  for (const item of evidence) {
    const key = [item.sourceLabel, item.sourceUrl ?? "", item.observedAt, item.freshUntil].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(sourceFromEvidence(item));
  }
  return sources;
}

function aggregateConfidence(sources: ImpactSource[]): "high" | "medium" {
  return sources.some((source) => source.confidence === "partner") ? "medium" : "high";
}

function rejection(
  input: ImpactRejection["input"],
  id: string,
  reason: ImpactRejectionReason,
): ImpactRejection {
  return { input, id, reason };
}

function candidateBlocksTravel(candidate: Candidate): boolean {
  return (
    candidate.kind === "status" ||
    (candidate.kind === "alert" &&
      (candidate.severity === "severe" || candidate.severity === "critical")) ||
    (candidate.kind === "closure" && candidate.priority >= 90)
  );
}

/**
 * Build one compact, explainable action card from the supplied local facts.
 * Highest-consequence facts lead; up to two additional trusted facts remain
 * visible so weather, travel, and parking can form one plan instead of cards
 * that contradict one another.
 */
export function buildImpactActionCard(input: ImpactEngineInput): ImpactEngineResult {
  const nowMs = parseTime(input.now);
  if (nowMs === null) {
    return { status: "suppressed", reason: "invalid-now", rejections: [] };
  }

  const primary = input.primary;
  const primaryStart = parseTime(primary.startsAt);
  const primaryEndParsed = parseTime(primary.endsAt);
  if (
    !clean(primary.id) ||
    !clean(primary.title) ||
    primaryStart === null ||
    (primary.endsAt != null && primaryEndParsed === null) ||
    (primaryEndParsed !== null && primaryEndParsed < primaryStart)
  ) {
    return { status: "suppressed", reason: "invalid-primary", rejections: [] };
  }

  const primaryTrust = evidenceState(primary.evidence, nowMs);
  if (primaryTrust !== "ok") {
    const reason: ImpactSuppressionReason =
      primaryTrust === "stale"
        ? "primary-stale"
        : primaryTrust === "unverified"
          ? "primary-unverified"
          : "invalid-primary";
    return { status: "suppressed", reason, rejections: [] };
  }

  // With no end time, fail closed as soon as the start passes; the engine
  // cannot safely claim the item is still in progress.
  if (
    (primaryEndParsed !== null && primaryEndParsed <= nowMs) ||
    (primaryEndParsed === null && primaryStart < nowMs)
  ) {
    return { status: "suppressed", reason: "primary-ended", rejections: [] };
  }

  const primaryEnd = primaryEndParsed ?? primaryStart;
  const candidates: Candidate[] = [];
  const rejections: ImpactRejection[] = [];

  let statusEvidence = primary.evidence;
  if (primary.status === "cancelled" || primary.status === "postponed") {
    statusEvidence = primary.statusEvidence ?? primary.evidence;
    const statusTrust = evidenceState(statusEvidence, nowMs);
    if (statusTrust !== "ok") {
      const reason: ImpactSuppressionReason =
        statusTrust === "stale"
          ? "status-stale"
          : statusTrust === "unverified"
            ? "status-unverified"
            : "invalid-primary";
      return { status: "suppressed", reason, rejections: [] };
    }
  }

  if (primary.status === "cancelled" || primary.status === "postponed") {
    const cancelled = primary.status === "cancelled";
    candidates.push({
      id: `status:${primary.id}`,
      kind: "status",
      priority: cancelled ? 100 : 98,
      severity: "critical",
      summary: `${clean(primary.title, 110)} is ${cancelled ? "cancelled" : "postponed"}.`,
      why: cancelled
        ? `The event is no longer scheduled as planned.`
        : `The original time is no longer reliable.`,
      action: {
        label: cancelled
          ? "Do not make the trip; check the organizer for updates."
          : "Check the organizer for the new date before traveling.",
        ...(statusEvidence.sourceUrl ? { href: statusEvidence.sourceUrl } : {}),
      },
      evidence: statusEvidence,
    });
  }

  // Route/transit/parking disruptions matter while the user is actually en
  // route. A trusted travel estimate lets those signals match the departure →
  // arrival window instead of requiring them to overlap the event itself.
  let tripWindowStart: number | null = null;
  if (
    input.travel &&
    evidenceState(input.travel.evidence, nowMs) === "ok" &&
    travelCandidate(input.travel, primary) !== null &&
    primaryStart > nowMs
  ) {
    const minutes = input.travel.durationMinutes + (input.travel.arriveEarlyMinutes ?? 0);
    tripWindowStart = Math.max(nowMs, primaryStart - minutes * 60_000);
  }

  for (const signal of input.signals ?? []) {
    if (!clean(signal.id)) {
      rejections.push(rejection("signal", signal.id, "invalid"));
      continue;
    }
    const trust = evidenceState(signal.evidence, nowMs);
    if (trust !== "ok") {
      rejections.push(rejection("signal", signal.id, trust));
      continue;
    }
    const tripSensitive =
      signal.kind === "closure" &&
      (signal.target === "route" || signal.target === "transit" || signal.target === "parking") &&
      tripWindowStart !== null;
    const relevance = signalWindowIsRelevant(
      signal.startsAt,
      signal.endsAt,
      tripSensitive ? tripWindowStart! : primaryStart,
      tripSensitive ? primaryStart : primaryEnd,
      nowMs,
    );
    if (relevance !== "ok") {
      rejections.push(rejection("signal", signal.id, relevance));
      continue;
    }
    const candidate = candidateForSignal(signal, primary);
    if (!candidate) {
      rejections.push(rejection("signal", signal.id, "not-actionable"));
      continue;
    }
    candidates.push(candidate);
  }

  let trustedTravel: ImpactTravelPlan | undefined;
  if (input.travel) {
    const trust = evidenceState(input.travel.evidence, nowMs);
    const id = `travel:${primary.id}`;
    if (trust !== "ok") {
      rejections.push(rejection("travel", id, trust));
    } else if (primaryStart <= nowMs) {
      rejections.push(rejection("travel", id, "irrelevant"));
    } else {
      const candidate = travelCandidate(input.travel, primary);
      if (!candidate) {
        rejections.push(rejection("travel", id, "invalid"));
      } else {
        trustedTravel = input.travel;
        candidates.push(candidate);
      }
    }
  }

  let trustedParking: ImpactParkingPlan | undefined;
  if (input.parking) {
    const trust = evidenceState(input.parking.evidence, nowMs);
    if (trust !== "ok") {
      rejections.push(rejection("parking", input.parking.id, trust));
    } else if (!clean(input.parking.id) || !clean(input.parking.name)) {
      rejections.push(rejection("parking", input.parking.id, "invalid"));
    } else {
      trustedParking = input.parking;
      candidates.push(parkingCandidate(input.parking, primary));
    }
  }

  const trustedNearby: ImpactNearbyAlternative[] = [];
  for (const alternative of input.nearbyAlternatives ?? []) {
    const trust = evidenceState(alternative.evidence, nowMs);
    if (trust !== "ok") {
      rejections.push(rejection("nearby-alternative", alternative.id, trust));
      continue;
    }
    if (
      !clean(alternative.id) ||
      !clean(alternative.title) ||
      (alternative.travelMinutes !== undefined &&
        (!Number.isFinite(alternative.travelMinutes) || alternative.travelMinutes < 0))
    ) {
      rejections.push(rejection("nearby-alternative", alternative.id, "invalid"));
      continue;
    }
    if (alternative.availability !== "available") {
      rejections.push(rejection("nearby-alternative", alternative.id, "not-actionable"));
      continue;
    }
    trustedNearby.push(alternative);
  }

  candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const lead = candidates[0];
  if (!lead) {
    return { status: "suppressed", reason: "no-actionable-facts", rejections };
  }
  // Once the safe action is "do not travel yet", route and parking facts are
  // deliberately withheld so the card cannot give mixed instructions.
  const selected = (
    lead.kind === "status"
      ? [lead]
      : candidateBlocksTravel(lead)
        ? candidates.filter(
            (candidate) => candidate.kind !== "travel" && candidate.kind !== "parking",
          )
        : candidates
  ).slice(0, MAX_FACTS);

  const leaveAtMs = leaveAtFor(primaryStart, nowMs, trustedTravel);
  let leaveAt = leaveAtMs === null ? null : new Date(leaveAtMs).toISOString();
  let nextAction = lead.action;
  const usedEvidence: ImpactEvidence[] = [
    primary.evidence,
    ...selected.map((candidate) => candidate.evidence),
  ];

  let backup: ImpactBackup | null = null;
  if (lead.kind === "parking" && trustedParking) {
    const validAlternatives = (trustedParking.alternatives ?? [])
      .filter((item) => {
        const trust = evidenceState(item.evidence ?? trustedParking!.evidence, nowMs);
        if (trust !== "ok") {
          rejections.push(rejection("parking", item.id, trust));
          return false;
        }
        if (
          !clean(item.id) ||
          !clean(item.name) ||
          (item.walkMinutes !== undefined &&
            (!Number.isFinite(item.walkMinutes) || item.walkMinutes < 0))
        ) {
          rejections.push(rejection("parking", item.id, "invalid"));
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const availableRank = Number(b.status === "available") - Number(a.status === "available");
        if (availableRank !== 0) return availableRank;
        return (a.walkMinutes ?? Number.POSITIVE_INFINITY) -
          (b.walkMinutes ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name);
      });
    const first = validAlternatives[0];
    if (first) {
      const evidence = first.evidence ?? trustedParking.evidence;
      usedEvidence.push(evidence);
      backup = {
        kind: "parking",
        itemId: first.id,
        label:
          first.status === "available"
            ? `${clean(first.name, 90)} has reported availability.`
            : `Parking alternative: ${clean(first.name, 90)}.`,
        ...(first.href ? { href: first.href } : {}),
      };
      if (trustedParking.status === "full" && first.status === "available") {
        nextAction = {
          label: `Use ${clean(first.name, 90)} instead.`,
          ...(first.href ? { href: first.href } : {}),
        };
      }
    }
  } else if (
    !(
      lead.kind === "alert" &&
      (lead.severity === "severe" || lead.severity === "critical")
    )
  ) {
    const weatherLed = lead.kind === "weather";
    trustedNearby.sort((a, b) => {
      if (weatherLed && Boolean(a.indoor) !== Boolean(b.indoor)) {
        return Number(Boolean(b.indoor)) - Number(Boolean(a.indoor));
      }
      return (a.travelMinutes ?? Number.POSITIVE_INFINITY) -
        (b.travelMinutes ?? Number.POSITIVE_INFINITY) || a.title.localeCompare(b.title);
    });
    const first = trustedNearby[0];
    if (first) {
      usedEvidence.push(first.evidence);
      backup = {
        kind: "nearby",
        itemId: first.id,
        label: `${first.indoor ? "Indoor backup" : "Nearby backup"}: ${clean(first.title, 90)}.`,
        ...(first.href ? { href: first.href } : {}),
      };
    } else if (lead.kind === "closure") {
      const closure = (input.signals ?? []).find(
        (signal): signal is ClosureImpactSignal =>
          signal.kind === "closure" && signal.id === lead.id,
      );
      if (closure?.detour) {
        backup = {
          kind: "detour",
          label: withPeriod(clean(closure.detour, 120)),
          ...(closure.evidence.sourceUrl ? { href: closure.evidence.sourceUrl } : {}),
        };
      }
    }
  }

  // Preserve a concrete leave-by instruction when it is safe and it does not
  // conflict with a cancellation, postponement, severe alert, or venue close.
  const blocksTravel = candidateBlocksTravel(lead);
  if (leaveAtMs !== null && !blocksTravel) {
    if (trustedTravel) usedEvidence.push(trustedTravel.evidence);
    const label = `Leave by ${formatTime(leaveAtMs, input.timeZone ?? "America/New_York")}.`;
    nextAction =
      lead.kind === "travel"
        ? { label }
        : { ...nextAction, label: `${withPeriod(nextAction.label)} ${label}` };
  } else if (blocksTravel) {
    leaveAt = null;
  }

  const facts: ImpactFact[] = selected.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    severity: candidate.severity,
    summary: withPeriod(candidate.summary),
    sourceLabel: clean(candidate.evidence.sourceLabel, 80),
  }));
  const supporting = selected[1];
  const whyItMatters = supporting
    ? `${withPeriod(lead.why)} Also: ${withPeriod(supporting.summary)}`
    : withPeriod(lead.why);
  const sources = uniqueSources(usedEvidence);

  return {
    status: "ready",
    rejections,
    card: {
      id: `impact:${primary.id}:${lead.id}`,
      primary: {
        id: primary.id,
        title: clean(primary.title, 120),
        startsAt: primary.startsAt,
        endsAt: primary.endsAt ?? null,
        ...(primary.href ? { href: primary.href } : {}),
      },
      urgency: lead.severity,
      confidence: aggregateConfidence(sources),
      whatChanged: withPeriod(lead.summary),
      whyItMatters: clean(whyItMatters, 240),
      nextAction,
      backup,
      leaveAt,
      facts,
      sources,
      generatedAt: input.now,
    },
  };
}
