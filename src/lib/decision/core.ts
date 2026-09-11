/**
 * Shared decision primitives for Frederick Radius.
 *
 * Surfaces still own their intent-specific policy. Coffee, an emergency
 * notice, and a Saturday event should not be forced through one magic score.
 * They do, however, need the same rules for evidence, availability, origin
 * trust, explainable factors, and deterministic ordering. This module is that
 * contract. It has no I/O, clock, browser, or framework dependencies.
 */

export type DecisionAvailabilityMode =
  | "required"
  | "bonus"
  | "not-applicable";

export type DecisionAvailabilityState =
  | "confirmed-open"
  | "confirmed-closed"
  | "unknown"
  | "not-applicable";

export type DecisionOriginTrust =
  | "precise"
  | "chosen"
  | "approximate"
  | "none";

export type DecisionFactor = {
  /** Stable machine name used in tests and analytics. */
  id: string;
  /** Complete, user-facing sentence explaining the factor. */
  label: string;
  /** Signed contribution. Negative factors affect rank but are not shown. */
  points: number;
  /** Explanation order may differ from score weight. This never changes rank. */
  reasonPriority?: number;
  /** Evidence identifiers, when the factor depends on a source record. */
  evidenceIds?: readonly string[];
  /** Some internal tie-breakers should never become explanatory copy. */
  visible?: boolean;
};

export type DecisionReason = {
  id: string;
  label: string;
  evidenceIds: string[];
};

export type DecisionClaimState = "confirmed" | "partial" | "insufficient";

export type DecisionScopeSummary = {
  label: string;
  source: "device" | "town" | "home" | "ip" | "county" | "none";
  originTrust: DecisionOriginTrust;
};

export type DecisionItem<T> = {
  id: string;
  title: string;
  value: T;
  availability: DecisionAvailabilityState;
  reasons: DecisionReason[];
};

/**
 * Client/server-safe output contract. It carries no raw coordinates and no
 * score. Today, Ask, Map, Events, Saved, and Compass may use different domain
 * policies while agreeing on what a decision looks like to a person.
 */
export type DecisionSet<T> = {
  status: "ready" | "insufficient";
  lead: DecisionItem<T> | null;
  alternatives: DecisionItem<T>[];
  scope: DecisionScopeSummary;
  claimState: DecisionClaimState;
  mayAssertNoneAvailable: boolean;
  totalCandidates: number;
};

export type DecisionEvaluation<T> = {
  candidate: T;
  score: number;
  factors: DecisionFactor[];
  reasons: DecisionReason[];
};

export type DecisionAvailabilityPolicy = {
  requested: DecisionAvailabilityMode;
  /** Whether current availability may exclude every unknown-hours candidate. */
  hardAvailability: boolean;
  /** Whether a zero result can honestly be described as none open. */
  mayAssertNoneOpen: boolean;
  /** How known-open evidence affects order when coverage is incomplete. */
  ordering: "open-first" | "open-nudge" | "neutral";
};

function finitePoints(points: number): number {
  return Number.isFinite(points) ? points : 0;
}

/**
 * Evaluate a candidate from named, inspectable factors. The numeric score is
 * deliberately private; the reasons are the product. Only positive visible
 * factors become copy, and duplicate sentences are collapsed.
 */
export function evaluateDecision<T>(
  candidate: T,
  factors: readonly DecisionFactor[],
  reasonLimit = 3,
): DecisionEvaluation<T> {
  const normalized = factors.map((factor) => ({
    ...factor,
    points: finitePoints(factor.points),
  }));
  const seen = new Set<string>();
  const reasons = [...normalized]
    .filter(
      (factor) =>
        factor.visible !== false &&
        factor.points > 0 &&
        factor.label.trim().length > 0,
    )
    .sort(
      (a, b) =>
        (b.reasonPriority ?? b.points) - (a.reasonPriority ?? a.points) ||
        b.points - a.points ||
        a.id.localeCompare(b.id),
    )
    .flatMap((factor) => {
      const label = factor.label.replace(/\s+/g, " ").trim();
      if (seen.has(label)) return [];
      seen.add(label);
      return [{
        id: factor.id,
        label,
        evidenceIds: [...new Set(factor.evidenceIds ?? [])],
      }];
    })
    .slice(0, Math.max(0, reasonLimit));

  return {
    candidate,
    score: normalized.reduce((total, factor) => total + factor.points, 0),
    factors: normalized,
    reasons,
  };
}

/** Stable score ordering with an explicit tie-breaker supplied by the surface. */
export function compareDecisionEvaluations<T>(
  a: DecisionEvaluation<T>,
  b: DecisionEvaluation<T>,
  tieBreak: (a: T, b: T) => number,
): number {
  const score = b.score - a.score;
  return score || tieBreak(a.candidate, b.candidate);
}

/**
 * Resolve one availability policy without pretending sparse coverage is a
 * statement about the real world. A surface must deliberately choose whether
 * confirmed-open evidence leads or merely nudges while coverage is thin.
 */
export function resolveDecisionAvailabilityPolicy({
  requested,
  hasSufficientCoverage,
  thinCoverageBehavior = "nudge",
}: {
  requested: DecisionAvailabilityMode;
  hasSufficientCoverage: boolean;
  thinCoverageBehavior?: "lead" | "nudge";
}): DecisionAvailabilityPolicy {
  if (requested === "not-applicable") {
    return {
      requested,
      hardAvailability: false,
      mayAssertNoneOpen: false,
      ordering: "neutral",
    };
  }
  if (requested === "required" && hasSufficientCoverage) {
    return {
      requested,
      hardAvailability: true,
      mayAssertNoneOpen: true,
      ordering: "open-first",
    };
  }
  return {
    requested,
    hardAvailability: false,
    mayAssertNoneOpen: false,
    ordering:
      requested === "required" && thinCoverageBehavior === "lead"
        ? "open-first"
        : "open-nudge",
  };
}

/** Only explicit user intent is allowed to power nearest-first decisions. */
export function decisionOriginTrust(
  source: "device" | "town" | "home" | "ip" | "county" | "none",
): DecisionOriginTrust {
  if (source === "device") return "precise";
  if (source === "town" || source === "home") return "chosen";
  if (source === "ip") return "approximate";
  return "none";
}

export function mayRankByDecisionOrigin(
  source: "device" | "town" | "home" | "ip" | "county" | "none",
): boolean {
  const trust = decisionOriginTrust(source);
  return trust === "precise" || trust === "chosen";
}
