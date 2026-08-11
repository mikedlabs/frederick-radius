import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import type { OpenStatus } from "@/lib/hours";
import { formatTime } from "@/lib/hours";
import type { ImpactConfidence } from "@/lib/impact-engine";
import type { NearbyUtility } from "./mapNearby";
import type { EventPin, MapPinPlace } from "./types";

/**
 * The map has many feeds, but a person should see a decision rather than a
 * layer inventory. This client-safe model turns normalized facts into one
 * lead, a short set of alternatives, the reasons that earned their position,
 * and only the overlays used by those reasons.
 *
 * It deliberately owns no fetching, geolocation, storage, or system clock.
 * Callers pass an explicit `now`, and live claims must carry their own expiry.
 */

export type MapDecisionIntent =
  | "go-now"
  | "event-plan"
  | "need-essential"
  | "trip"
  | "explore";

export type MapDecisionOverlay =
  | "places"
  | "events"
  | "parking"
  | "transit"
  | "weather"
  | "traffic"
  | "civic"
  | `amenity:${string}`;

export type MapDecisionEvidenceBasis =
  | "static-record"
  | "schedule"
  | "live-status";

export type MapDecisionEvidence = {
  id: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  confidence: ImpactConfidence;
  verified: boolean;
  basis: MapDecisionEvidenceBasis;
  /** Required for schedule/live evidence; optional for a sourced static map record. */
  observedAt?: string | null;
  /** Required for schedule/live evidence. The model never invents a TTL. */
  freshUntil?: string | null;
};

export type MapDecisionEvidenceState =
  | "current"
  | "mapped"
  | "stale"
  | "invalid";

export type MapCandidateAvailability =
  | {
      state: "confirmed-open";
      evidenceId: string;
      until?: string | null;
    }
  | {
      state: "confirmed-closed";
      evidenceId: string;
      until?: string | null;
    }
  | { state: "unknown" }
  | { state: "not-applicable" };

export type MapDecisionReasonSeed = {
  id: string;
  label: string;
  weight: number;
  evidenceIds?: string[];
  overlay?: MapDecisionOverlay;
};

export type MapDecisionCandidate = {
  id: string;
  kind: "place" | "event" | "amenity" | "parking" | "transit" | "civic";
  title: string;
  href?: string;
  actionLabel?: string;
  location?: LngLat;
  startsAt?: string | null;
  endsAt?: string | null;
  availability: MapCandidateAvailability;
  evidence: MapDecisionEvidence[];
  reasons?: MapDecisionReasonSeed[];
  /** A small editorial tie-breaker, not a purchasable rank. */
  priority?: number;
  overlays?: MapDecisionOverlay[];
};

export type MapDecisionSignal = {
  id: string;
  kind: "weather" | "traffic" | "transit" | "parking" | "civic";
  title: string;
  severity: "info" | "caution" | "severe" | "critical";
  startsAt?: string | null;
  endsAt?: string | null;
  evidence: MapDecisionEvidence;
  overlay: MapDecisionOverlay;
  /** Explicit joins win; geometry is used only when this list is absent. */
  affectsCandidateIds?: string[];
  geometry?:
    | { type: "point"; point: LngLat }
    | { type: "path"; path: LngLat[] };
  effect: "note" | "delay" | "avoid";
  delayMinutes?: number;
  actionLabel?: string;
  actionHref?: string;
};

export type MapDecisionRoute = {
  candidateId: string;
  mode: "walk" | "bike" | "drive" | "transit";
  path: LngLat[];
  durationMinutes?: number;
  corridorMeters?: number;
  evidence?: MapDecisionEvidence;
};

export type MapDecisionSceneInput = {
  now: string;
  intent: MapDecisionIntent;
  origin?: LngLat | null;
  candidates: MapDecisionCandidate[];
  signals?: MapDecisionSignal[];
  routes?: MapDecisionRoute[];
  alternativeLimit?: number;
};

export type MapDecisionReason = {
  id: string;
  label: string;
  evidenceIds: string[];
  overlay?: MapDecisionOverlay;
};

export type MapRouteConsequence = {
  signalId: string;
  candidateId: string;
  title: string;
  severity: MapDecisionSignal["severity"];
  effect: MapDecisionSignal["effect"];
  delayMinutes: number | null;
  actionLabel?: string;
  actionHref?: string;
  sourceLabel: string;
  sourceUrl: string | null;
  observedAt: string | null;
  overlay: MapDecisionOverlay;
};

export type MapDecisionPick = {
  id: string;
  kind: MapDecisionCandidate["kind"];
  title: string;
  href?: string;
  actionLabel: string;
  confidence: "confirmed" | "partial";
  availability: "confirmed-open" | "confirmed-closed" | "unknown" | "not-applicable";
  distanceMeters: number | null;
  startsAt: string | null;
  reasons: MapDecisionReason[];
};

export type MapDecisionSource = {
  id: string;
  label: string;
  url: string | null;
  state: Exclude<MapDecisionEvidenceState, "invalid">;
  observedAt: string | null;
  freshUntil: string | null;
};

export type MapDecisionRejection = {
  kind: "candidate" | "signal" | "route";
  id: string;
  reason:
    | "invalid"
    | "stale"
    | "ended"
    | "confirmed-closed"
    | "outside-route"
    | "not-relevant";
};

export type MapDecisionScene =
  | {
      status: "ready";
      intent: MapDecisionIntent;
      lead: MapDecisionPick;
      alternatives: MapDecisionPick[];
      routeConsequences: MapRouteConsequence[];
      relevantOverlays: MapDecisionOverlay[];
      /** Earliest evidence expiry or event boundary used by the scene. */
      expiresAt: string | null;
      coverage: "confirmed" | "partial";
      sources: MapDecisionSource[];
      rejections: MapDecisionRejection[];
    }
  | {
      status: "insufficient";
      intent: MapDecisionIntent;
      reason: "invalid-clock" | "no-usable-candidates";
      /** `insufficient` means Radius cannot decide; it never means nothing exists. */
      rejections: MapDecisionRejection[];
    };

const TRUSTED_CONFIDENCE = new Set<ImpactConfidence>([
  "curated",
  "partner",
  "verified",
]);
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const DEFAULT_CORRIDOR_METERS = 120;
const MAX_REASONS = 4;

function clean(value: unknown, max = 160): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapDecisionEvidenceState(
  evidence: MapDecisionEvidence,
  now: string | number | Date,
): MapDecisionEvidenceState {
  const nowMs = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowMs) || !clean(evidence.id) || !clean(evidence.sourceLabel)) {
    return "invalid";
  }

  if (evidence.basis === "static-record") {
    return evidence.verified && TRUSTED_CONFIDENCE.has(evidence.confidence)
      ? "current"
      : "mapped";
  }

  const observedAt = time(evidence.observedAt);
  const freshUntil = time(evidence.freshUntil);
  if (
    observedAt === null ||
    freshUntil === null ||
    freshUntil < observedAt ||
    observedAt > nowMs + MAX_FUTURE_SKEW_MS
  ) {
    return evidence.verified ? "invalid" : "mapped";
  }
  if (nowMs > freshUntil) return "stale";
  return evidence.verified && TRUSTED_CONFIDENCE.has(evidence.confidence)
    ? "current"
    : "mapped";
}

function localMeters(point: LngLat, origin: LngLat): { x: number; y: number } {
  const latRadians = ((point.lat + origin.lat) / 2) * Math.PI / 180;
  return {
    x: (point.lng - origin.lng) * 111_320 * Math.cos(latRadians),
    y: (point.lat - origin.lat) * 110_540,
  };
}

function pointSegmentDistanceMeters(point: LngLat, start: LngLat, end: LngLat): number {
  const p = localMeters(point, start);
  const b = localMeters(end, start);
  const lengthSquared = b.x * b.x + b.y * b.y;
  if (lengthSquared === 0) return Math.hypot(p.x, p.y);
  const t = Math.max(0, Math.min(1, (p.x * b.x + p.y * b.y) / lengthSquared));
  return Math.hypot(p.x - t * b.x, p.y - t * b.y);
}

function orientation(a: LngLat, b: LngLat, c: LngLat): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function segmentsCross(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const within = (value: number, edgeA: number, edgeB: number) =>
    value >= Math.min(edgeA, edgeB) && value <= Math.max(edgeA, edgeB);
  const onSegment = (start: LngLat, point: LngLat, end: LngLat) =>
    within(point.lng, start.lng, end.lng) &&
    within(point.lat, start.lat, end.lat);
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && onSegment(a, c, b)) return true;
  if (abD === 0 && onSegment(a, d, b)) return true;
  if (cdA === 0 && onSegment(c, a, d)) return true;
  if (cdB === 0 && onSegment(c, b, d)) return true;
  return ((abC < 0 && abD > 0) || (abC > 0 && abD < 0)) &&
    ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0));
}

/** True only when the supplied point/path actually touches the route corridor. */
export function geometryIntersectsRouteCorridor(
  route: readonly LngLat[],
  geometry: NonNullable<MapDecisionSignal["geometry"]>,
  corridorMeters = DEFAULT_CORRIDOR_METERS,
): boolean {
  if (route.length < 2 || !Number.isFinite(corridorMeters) || corridorMeters < 0) return false;
  const signalPath = geometry.type === "point" ? [geometry.point] : geometry.path;
  if (signalPath.length === 0) return false;

  for (const point of signalPath) {
    for (let routeIndex = 1; routeIndex < route.length; routeIndex += 1) {
      if (pointSegmentDistanceMeters(point, route[routeIndex - 1], route[routeIndex]) <= corridorMeters) {
        return true;
      }
    }
  }

  if (geometry.type === "path") {
    for (let signalIndex = 1; signalIndex < signalPath.length; signalIndex += 1) {
      for (let routeIndex = 1; routeIndex < route.length; routeIndex += 1) {
        if (segmentsCross(
          signalPath[signalIndex - 1],
          signalPath[signalIndex],
          route[routeIndex - 1],
          route[routeIndex],
        )) return true;
      }
    }
  }
  return false;
}

function intervalRelevant(signal: MapDecisionSignal, nowMs: number): boolean {
  const start = signal.startsAt ? time(signal.startsAt) : null;
  const end = signal.endsAt ? time(signal.endsAt) : null;
  if (signal.startsAt && start === null) return false;
  if (signal.endsAt && end === null) return false;
  if (start !== null && end !== null && end < start) return false;
  if (end !== null && end <= nowMs) return false;
  return start === null || start <= nowMs + 24 * 60 * 60_000;
}

function consequencePriority(item: MapRouteConsequence): number {
  const severity = item.severity === "critical" ? 400 : item.severity === "severe" ? 300 : item.severity === "caution" ? 200 : 100;
  const effect = item.effect === "avoid" ? 30 : item.effect === "delay" ? 20 : 10;
  return severity + effect + (item.delayMinutes ?? 0);
}

/**
 * Match only current, sourced consequences to a route. Missing geometry is not
 * guessed; an explicit candidate join is required in that case.
 */
export function routeConsequencesForCandidate({
  candidateId,
  route,
  signals,
  now,
}: {
  candidateId: string;
  route?: MapDecisionRoute;
  signals: readonly MapDecisionSignal[];
  now: string;
}): { consequences: MapRouteConsequence[]; rejections: MapDecisionRejection[] } {
  const nowMs = Date.parse(now);
  const consequences: MapRouteConsequence[] = [];
  const rejections: MapDecisionRejection[] = [];

  for (const signal of signals) {
    const state = mapDecisionEvidenceState(signal.evidence, now);
    if (state !== "current") {
      rejections.push({ kind: "signal", id: signal.id, reason: state === "stale" ? "stale" : "invalid" });
      continue;
    }
    if (!intervalRelevant(signal, nowMs)) {
      rejections.push({ kind: "signal", id: signal.id, reason: "not-relevant" });
      continue;
    }

    const explicitlyAffected = signal.affectsCandidateIds?.includes(candidateId) ?? false;
    const corridorAffected = route && signal.geometry
      ? geometryIntersectsRouteCorridor(route.path, signal.geometry, route.corridorMeters)
      : false;
    if (!explicitlyAffected && !corridorAffected) {
      rejections.push({ kind: "signal", id: signal.id, reason: "outside-route" });
      continue;
    }

    const delay = signal.delayMinutes;
    consequences.push({
      signalId: signal.id,
      candidateId,
      title: clean(signal.title, 120),
      severity: signal.severity,
      effect: signal.effect,
      delayMinutes: Number.isFinite(delay) && delay! >= 0 ? Math.round(delay!) : null,
      actionLabel: clean(signal.actionLabel, 100) || undefined,
      actionHref: signal.actionHref,
      sourceLabel: clean(signal.evidence.sourceLabel, 80),
      sourceUrl: signal.evidence.sourceUrl ?? null,
      observedAt: signal.evidence.observedAt ?? null,
      overlay: signal.overlay,
    });
  }

  consequences.sort((a, b) => consequencePriority(b) - consequencePriority(a) || a.signalId.localeCompare(b.signalId));
  return { consequences, rejections };
}

type RankedCandidate = {
  candidate: MapDecisionCandidate;
  score: number;
  evidenceStates: Map<string, MapDecisionEvidenceState>;
  recordState: MapDecisionEvidenceState;
  availability: MapDecisionPick["availability"];
  distanceMeters: number | null;
  reasons: Array<MapDecisionReason & { weight: number }>;
  consequences: MapRouteConsequence[];
};

function defaultAction(candidate: MapDecisionCandidate): string {
  if (candidate.actionLabel) return candidate.actionLabel;
  if (candidate.kind === "event") return "Open event";
  if (candidate.kind === "amenity") return "Show on map";
  if (candidate.kind === "parking") return "Open parking";
  if (candidate.kind === "transit") return "Open transit";
  return "Open details";
}

function candidateRecordState(states: Map<string, MapDecisionEvidenceState>): MapDecisionEvidenceState {
  const values = [...states.values()];
  if (values.includes("current")) return "current";
  if (values.includes("mapped")) return "mapped";
  if (values.includes("stale")) return "stale";
  return "invalid";
}

function candidateAvailability(
  availability: MapCandidateAvailability,
  states: Map<string, MapDecisionEvidenceState>,
): MapDecisionPick["availability"] {
  if (availability.state === "unknown" || availability.state === "not-applicable") {
    return availability.state;
  }
  return states.get(availability.evidenceId) === "current"
    ? availability.state
    : "unknown";
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "the listed time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function rankCandidate(
  candidate: MapDecisionCandidate,
  input: MapDecisionSceneInput,
  nowMs: number,
): RankedCandidate | MapDecisionRejection {
  if (!clean(candidate.id) || !clean(candidate.title) || candidate.evidence.length === 0) {
    return { kind: "candidate", id: candidate.id, reason: "invalid" };
  }
  const evidenceStates = new Map(candidate.evidence.map((item) => [item.id, mapDecisionEvidenceState(item, input.now)]));
  const recordState = candidateRecordState(evidenceStates);
  if (recordState === "invalid") return { kind: "candidate", id: candidate.id, reason: "invalid" };

  const startsAt = time(candidate.startsAt);
  const endsAt = time(candidate.endsAt);
  if ((candidate.startsAt && startsAt === null) || (candidate.endsAt && endsAt === null)) {
    return { kind: "candidate", id: candidate.id, reason: "invalid" };
  }
  if ((endsAt !== null && endsAt <= nowMs) || (endsAt === null && startsAt !== null && startsAt < nowMs && candidate.kind === "event")) {
    return { kind: "candidate", id: candidate.id, reason: "ended" };
  }

  const availability = candidateAvailability(candidate.availability, evidenceStates);
  if (input.intent === "go-now" && availability === "confirmed-closed") {
    return { kind: "candidate", id: candidate.id, reason: "confirmed-closed" };
  }

  const distanceMeters = input.origin && candidate.location
    ? haversineMeters(input.origin, candidate.location)
    : null;
  let score = Math.max(-25, Math.min(25, candidate.priority ?? 0));
  score += recordState === "current" ? 24 : recordState === "mapped" ? 7 : -12;
  if (input.intent === "go-now") {
    score += availability === "confirmed-open" ? 50 : availability === "unknown" ? -10 : 0;
  }
  if (input.intent === "event-plan" && candidate.kind === "event") score += 44;
  if (input.intent === "need-essential" && candidate.kind === "amenity") score += 44;
  if (input.intent === "trip" && ["parking", "transit"].includes(candidate.kind)) score += 30;
  if (distanceMeters !== null) score += Math.max(-25, 25 - distanceMeters / 500);
  if (startsAt !== null && startsAt >= nowMs) {
    score += Math.max(0, 24 - (startsAt - nowMs) / 3_600_000);
  }

  const route = input.routes?.find((item) => item.candidateId === candidate.id);
  const { consequences, rejections: ignoredRejections } = routeConsequencesForCandidate({
    candidateId: candidate.id,
    route,
    signals: input.signals ?? [],
    now: input.now,
  });
  void ignoredRejections;
  for (const consequence of consequences) {
    score -= consequence.effect === "avoid" ? 80 : consequence.effect === "delay" ? Math.min(35, 10 + (consequence.delayMinutes ?? 0)) : 5;
  }

  const reasons: Array<MapDecisionReason & { weight: number }> = [];
  if (availability === "confirmed-open") {
    const evidenceId = candidate.availability.state === "confirmed-open" ? candidate.availability.evidenceId : "";
    const until = candidate.availability.state === "confirmed-open" && candidate.availability.until
      ? ` until ${formatTime(candidate.availability.until)}`
      : "";
    reasons.push({ id: `availability:${candidate.id}`, label: `Confirmed open${until}`, evidenceIds: [evidenceId], overlay: "places", weight: 100 });
  } else if (availability === "unknown" && input.intent === "go-now") {
    reasons.push({ id: `availability:${candidate.id}`, label: "Hours are not confirmed", evidenceIds: [], overlay: "places", weight: 18 });
  }
  if (startsAt !== null && startsAt >= nowMs) {
    reasons.push({ id: `timing:${candidate.id}`, label: `Starts ${formatEventTime(candidate.startsAt!)}`, evidenceIds: candidate.evidence.map((item) => item.id), overlay: "events", weight: 88 });
  }
  if (distanceMeters !== null) {
    reasons.push({ id: `distance:${candidate.id}`, label: `${formatDistance(distanceMeters)} away`, evidenceIds: [], weight: 76 });
  }
  for (const reason of candidate.reasons ?? []) {
    const evidenceIds = (reason.evidenceIds ?? []).filter((id) => {
      const state = evidenceStates.get(id);
      return state === "current" || state === "mapped";
    });
    if ((reason.evidenceIds?.length ?? 0) > 0 && evidenceIds.length === 0) continue;
    const label = clean(reason.label, 120);
    if (!label) continue;
    reasons.push({ id: reason.id, label, evidenceIds, overlay: reason.overlay, weight: reason.weight });
  }
  for (const consequence of consequences) {
    reasons.push({
      id: `consequence:${consequence.signalId}`,
      label: consequence.effect === "delay" && consequence.delayMinutes
        ? `${consequence.title} may add ${consequence.delayMinutes} minutes`
        : consequence.title,
      evidenceIds: [consequence.signalId],
      overlay: consequence.overlay,
      weight: 110 + consequencePriority(consequence),
    });
  }
  reasons.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));

  return {
    candidate,
    score,
    evidenceStates,
    recordState,
    availability,
    distanceMeters,
    reasons: reasons.slice(0, MAX_REASONS),
    consequences,
  };
}

function pickFromRanked(item: RankedCandidate): MapDecisionPick {
  return {
    id: item.candidate.id,
    kind: item.candidate.kind,
    title: item.candidate.title,
    href: item.candidate.href,
    actionLabel: defaultAction(item.candidate),
    confidence: item.recordState === "current" && item.availability !== "unknown" ? "confirmed" : "partial",
    availability: item.availability,
    distanceMeters: item.distanceMeters,
    startsAt: item.candidate.startsAt ?? null,
    reasons: item.reasons.map((reason) => ({
      id: reason.id,
      label: reason.label,
      evidenceIds: reason.evidenceIds,
      overlay: reason.overlay,
    })),
  };
}

function sourceForEvidence(
  evidence: MapDecisionEvidence,
  state: MapDecisionEvidenceState,
): MapDecisionSource | null {
  if (state === "invalid") return null;
  return {
    id: evidence.id,
    label: clean(evidence.sourceLabel, 80),
    url: evidence.sourceUrl ?? null,
    state,
    observedAt: evidence.observedAt ?? null,
    freshUntil: evidence.freshUntil ?? null,
  };
}

export function buildMapDecisionScene(input: MapDecisionSceneInput): MapDecisionScene {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) {
    return { status: "insufficient", intent: input.intent, reason: "invalid-clock", rejections: [] };
  }

  const ranked: RankedCandidate[] = [];
  const rejections: MapDecisionRejection[] = [];
  for (const candidate of input.candidates) {
    const result = rankCandidate(candidate, input, nowMs);
    if ("reason" in result) rejections.push(result);
    else ranked.push(result);
  }
  ranked.sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title) || a.candidate.id.localeCompare(b.candidate.id));
  const lead = ranked[0];
  if (!lead) {
    return { status: "insufficient", intent: input.intent, reason: "no-usable-candidates", rejections };
  }

  const alternativeLimit = Math.max(0, Math.min(3, input.alternativeLimit ?? 2));
  const selected = [lead, ...ranked.slice(1, 1 + alternativeLimit)];
  const usedEvidence = selected.flatMap((item) => item.candidate.evidence);
  const usedSignals = lead.consequences.map((item) => input.signals?.find((signal) => signal.id === item.signalId)?.evidence).filter((item): item is MapDecisionEvidence => Boolean(item));
  const uniqueEvidence = [...new Map([...usedEvidence, ...usedSignals].map((item) => [item.id, item])).values()];
  const sources = uniqueEvidence
    .map((item) => sourceForEvidence(item, mapDecisionEvidenceState(item, input.now)))
    .filter((item): item is MapDecisionSource => item !== null);
  const expiries = uniqueEvidence
    .map((item) => time(item.freshUntil))
    .filter((item): item is number => item !== null && item > nowMs);
  const eventBoundary = time(lead.candidate.endsAt) ?? time(lead.candidate.startsAt);
  if (eventBoundary !== null && eventBoundary > nowMs) expiries.push(eventBoundary);
  const overlays = new Set<MapDecisionOverlay>(lead.candidate.overlays ?? []);
  for (const reason of lead.reasons) if (reason.overlay) overlays.add(reason.overlay);
  for (const consequence of lead.consequences) overlays.add(consequence.overlay);

  const coverage = lead.recordState === "current" &&
    (input.intent !== "go-now" || lead.availability === "confirmed-open")
    ? "confirmed"
    : "partial";

  return {
    status: "ready",
    intent: input.intent,
    lead: pickFromRanked(lead),
    alternatives: selected.slice(1).map(pickFromRanked),
    routeConsequences: lead.consequences,
    relevantOverlays: [...overlays],
    expiresAt: expiries.length > 0 ? new Date(Math.min(...expiries)).toISOString() : null,
    coverage,
    sources,
    rejections,
  };
}

export type MapPeekDecisionCue = {
  kind: "event" | "utility" | "parking" | "special";
  headline: string;
  detail: string;
  href?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  observedAt?: string;
};

export type MapPeekDecisionInput = {
  place: Pick<MapPinPlace, "slug" | "deal_hook">;
  hostedEvent?: EventPin | null;
  nearestGarage?: { name: string; distM: number } | null;
  nearbyUtilities?: NearbyUtility[];
  now: string;
};

export type MapPeekDecisionItem = MapPeekDecisionCue & {
  candidateId: string;
};

export type MapPeekDecisionSurface = {
  lead: MapPeekDecisionItem;
  alternatives: MapPeekDecisionItem[];
  coverage: "confirmed" | "partial";
  expiresAt: string | null;
};

function short(value: string, max = 30): string {
  const text = clean(value, max);
  return text;
}

/** A price or percentage alone is not enough context for a recommendation. */
function decisionUsefulSpecial(value: string | null | undefined): string | null {
  const detail = clean(value, 120);
  if (!detail) return null;
  const usefulWords = detail
    .match(/[a-z]{3,}/gi)
    ?.map((word) => word.toLowerCase())
    .filter((word) => !["and", "for", "off", "the"].includes(word));
  return usefulWords && usefulWords.length > 0 ? detail : null;
}

/**
 * Compact adapter for the already-selected place. It does not invent a best
 * place; it ranks only the supporting facts attached to the tapped place.
 */
export function buildMapPeekDecisionSurface({
  place,
  hostedEvent,
  nearestGarage,
  nearbyUtilities,
  now,
}: MapPeekDecisionInput): MapPeekDecisionSurface | null {
  const nowMs = Date.parse(now);
  const eventStart = time(hostedEvent?.starts_at);
  if (!Number.isFinite(nowMs)) return null;

  const candidates: MapDecisionCandidate[] = [];
  const cues = new Map<string, MapPeekDecisionCue>();
  if (hostedEvent && eventStart !== null && eventStart >= nowMs && eventStart - nowMs <= 24 * 60 * 60_000) {
    const eventTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(eventStart));
    const id = `peek:event:${hostedEvent.slug}`;
    const evidenceId = `peek-evidence:event:${hostedEvent.slug}`;
    candidates.push({
      id,
      kind: "event",
      title: hostedEvent.title,
      href: `/events/${hostedEvent.slug}`,
      startsAt: hostedEvent.starts_at,
      endsAt: hostedEvent.ends_at,
      availability: { state: "not-applicable" },
      priority: 25,
      overlays: ["events"],
      evidence: [{
        id: evidenceId,
        sourceLabel: "Frederick Radius event feeds",
        sourceUrl: `/events/${hostedEvent.slug}`,
        confidence: "unverified",
        verified: false,
        basis: "static-record",
      }],
      reasons: [{
        id: `event-here:${hostedEvent.slug}`,
        label: `${hostedEvent.title} is listed here at ${eventTime}.`,
        weight: 95,
        evidenceIds: [evidenceId],
        overlay: "events",
      }],
    });
    cues.set(id, {
      kind: "event",
      headline: `${short(hostedEvent.title, 25)} · ${eventTime}`,
      detail: `${hostedEvent.title} is listed here at ${eventTime}.`,
      href: `/events/${hostedEvent.slug}`,
    });
  }

  const specialDetail = decisionUsefulSpecial(place.deal_hook);
  if (specialDetail) {
    const id = `peek:special:${place.slug}`;
    const evidenceId = `peek-evidence:special:${place.slug}`;
    candidates.push({
      id,
      kind: "place",
      title: "Special at this stop",
      href: `/places/${place.slug}`,
      availability: { state: "not-applicable" },
      priority: 20,
      overlays: ["places"],
      evidence: [{
        id: evidenceId,
        sourceLabel: "Frederick Radius place guide",
        sourceUrl: `/places/${place.slug}`,
        confidence: "curated",
        verified: true,
        basis: "static-record",
      }],
      reasons: [{
        id: `special:${place.slug}`,
        label: specialDetail,
        weight: 90,
        evidenceIds: [evidenceId],
        overlay: "places",
      }],
    });
    cues.set(id, {
      kind: "special",
      headline: "Special at this stop",
      detail: specialDetail,
      href: `/places/${place.slug}`,
      sourceLabel: "Frederick Radius place guide",
      sourceUrl: `/places/${place.slug}`,
    });
  }

  const utility = nearbyUtilities?.[0];
  if (utility) {
    const id = `peek:utility:${utility.label.toLowerCase()}`;
    const evidenceId = `peek-evidence:utility:${utility.label.toLowerCase()}`;
    candidates.push({
      id,
      kind: "amenity",
      title: utility.label,
      availability: { state: "not-applicable" },
      priority: 25,
      overlays: [`amenity:${utility.label.toLowerCase()}`],
      evidence: [{
        id: evidenceId,
        sourceLabel: "Mapped amenity record",
        confidence: "unverified",
        verified: false,
        basis: "static-record",
      }],
      reasons: [{
        id: `nearest:${utility.label.toLowerCase()}`,
        label: `The nearest mapped ${utility.label.toLowerCase()} is ${formatDistance(utility.distM)} away.`,
        weight: 80,
        evidenceIds: [evidenceId],
        overlay: `amenity:${utility.label.toLowerCase()}`,
      }],
    });
    cues.set(id, {
      kind: "utility",
      headline: `${short(utility.label, 20)} · ${formatDistance(utility.distM)}`,
      detail: `The nearest mapped ${utility.label.toLowerCase()} is ${formatDistance(utility.distM)} away.`,
    });
  }

  if (nearestGarage) {
    const id = `peek:parking:${nearestGarage.name.toLowerCase()}`;
    const evidenceId = `peek-evidence:parking:${nearestGarage.name.toLowerCase()}`;
    candidates.push({
      id,
      kind: "parking",
      title: nearestGarage.name,
      availability: { state: "unknown" },
      priority: 4,
      overlays: ["parking"],
      evidence: [{
        id: evidenceId,
        sourceLabel: "City of Frederick parking map",
        sourceUrl: "https://www.cityoffrederickmd.gov/207/Parking",
        confidence: "verified",
        verified: true,
        basis: "static-record",
      }],
      reasons: [{
        id: `parking-near:${place.slug}`,
        label: `${nearestGarage.name} is mapped ${formatDistance(nearestGarage.distM)} away.`,
        weight: 70,
        evidenceIds: [evidenceId],
        overlay: "parking",
      }],
    });
    cues.set(id, {
      kind: "parking",
      headline: `Parking · ${formatDistance(nearestGarage.distM)}`,
      detail: `${nearestGarage.name} is mapped ${formatDistance(nearestGarage.distM)} away.`,
      sourceLabel: "City of Frederick parking map",
      sourceUrl: "https://www.cityoffrederickmd.gov/207/Parking",
    });
  }

  const scene = buildMapDecisionScene({
    now,
    intent: "explore",
    candidates,
    alternativeLimit: 2,
  });
  if (scene.status !== "ready") return null;

  const leadCue = cues.get(scene.lead.id);
  if (!leadCue) return null;

  const alternatives = scene.alternatives.flatMap((candidate) => {
    const cue = cues.get(candidate.id);
    return cue ? [{ ...cue, candidateId: candidate.id }] : [];
  });

  return {
    lead: { ...leadCue, candidateId: scene.lead.id },
    alternatives,
    coverage: scene.coverage,
    expiresAt: scene.expiresAt,
  };
}

/** Backward-compatible lead-only adapter for compact callers and tests. */
export function buildMapPeekDecisionCue(input: MapPeekDecisionInput): MapPeekDecisionCue | null {
  return buildMapPeekDecisionSurface(input)?.lead ?? null;
}

/** A freshness cue for compact UI. No timestamp means no freshness claim. */
export function mapDecisionFreshnessLabel(value: string | null | undefined): string | null {
  const parsed = time(value);
  if (parsed === null) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

/** Build a seven-day hours evidence window without hiding its policy. */
export function mapHoursEvidence(
  id: string,
  observedAt: string | null | undefined,
): MapDecisionEvidence | null {
  const observed = time(observedAt);
  if (observed === null) return null;
  return {
    id,
    sourceLabel: "Frederick Radius hours record",
    sourceUrl: null,
    confidence: "verified",
    verified: true,
    basis: "live-status",
    observedAt: new Date(observed).toISOString(),
    freshUntil: new Date(observed + 7 * 24 * 60 * 60_000).toISOString(),
  };
}

export function availabilityFromOpenStatus(
  status: OpenStatus,
  evidence: MapDecisionEvidence | null,
): MapCandidateAvailability {
  if (!evidence) return { state: "unknown" };
  if (status.state === "open" || status.state === "closing-soon") {
    return { state: "confirmed-open", evidenceId: evidence.id, until: status.closesAt };
  }
  if (status.state === "closed") return { state: "confirmed-closed", evidenceId: evidence.id };
  return { state: "unknown" };
}
