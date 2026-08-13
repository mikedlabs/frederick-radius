import { alertPriority } from "@/lib/alert-priority";
import type { FloodKey } from "@/lib/integrations/floodStage";

export type PulseAlertSignal = {
  event: string;
  headline: string;
  description: string;
  severity: string;
};

/** Lower numbers are more consequential. This compares unlike NWS products
 * only for the Pulse lead; the official detail remains intact in the tile. */
export function pulseAlertPriority(a: PulseAlertSignal): number {
  return alertPriority(a);
}

export function pulseAqiPriority(categoryId: number): number {
  if (categoryId >= 6) return 3; // Hazardous
  if (categoryId >= 5) return 4; // Very Unhealthy
  if (categoryId >= 4) return 6; // Unhealthy
  if (categoryId >= 3) return 8; // Unhealthy for Sensitive Groups
  return Number.POSITIVE_INFINITY;
}

/** An official NWS stage category is a live water condition, not a decorative
 * gauge reading. Action stage is an advisory; minor flooding and above rank
 * alongside immediate weather and public-safety conditions. */
export function pulseFloodPriority(category: FloodKey): number {
  if (category === "major") return 1;
  if (category === "moderate") return 2;
  if (category === "minor") return 3;
  if (category === "action") return 6;
  return Number.POSITIVE_INFINITY;
}

/** A measured AQI can lead a low-priority statement, but never displace an
 * equally ranked or stronger warning such as a Tornado Warning. */
export function shouldAqiLead(
  categoryId: number,
  alert: PulseAlertSignal | null | undefined,
): boolean {
  const rank = pulseAqiPriority(categoryId);
  if (!Number.isFinite(rank)) return false;
  return !alert || rank < pulseAlertPriority(alert);
}

export type PulseLeadFamily =
  | "weather"
  | "civic"
  | "fire-rescue"
  | "police"
  | "schools"
  | "traffic"
  | "power"
  | "air"
  | "water";

export type PulseLeadCandidate = {
  id: string;
  family: PulseLeadFamily;
  /** Lower numbers indicate greater immediate consequence. */
  priority: number;
  /** Plain-language basis retained for tests, logs, and future UI inspection. */
  reason: string;
  observedAt?: string | null;
};

const FAMILY_TIE_BREAK: Record<PulseLeadFamily, number> = {
  weather: 0,
  civic: 1,
  water: 2,
  "fire-rescue": 3,
  police: 4,
  schools: 5,
  traffic: 6,
  power: 7,
  air: 8,
};

function observedMs(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Pick one cross-source lead using consequence first, then the kind of source,
 * then recency. This replaces page-order priority: adding a new tile can no
 * longer accidentally put a routine outage, AQI reading, or road advisory in
 * front of an official City emergency or severe fire/rescue call.
 */
export function selectPulseLeadCandidate<T extends PulseLeadCandidate>(
  candidates: readonly (T | null | undefined | false)[],
): T | null {
  const ranked = candidates.filter((candidate): candidate is T => Boolean(candidate));
  ranked.sort(
    (left, right) =>
      left.priority - right.priority ||
      FAMILY_TIE_BREAK[left.family] - FAMILY_TIE_BREAK[right.family] ||
      observedMs(right.observedAt) - observedMs(left.observedAt) ||
      left.id.localeCompare(right.id),
  );
  return ranked[0] ?? null;
}

export function civicAlertPriority(
  kind: "city-emergency" | "health-burn-ban" | "health-closing" | "health-notice",
): number {
  if (kind === "city-emergency") return 1;
  if (kind === "health-closing") return 4;
  if (kind === "health-burn-ban") return 5;
  return 7;
}

/** Keep a small but real utility outage visible without describing it as a
 * county-scale emergency. A thousand customers or one percent of the served
 * area is high severity; smaller active totals are elevated. */
export function powerOutageTone(
  totalOut: number,
  totalServed: number,
): "danger" | "warning" {
  const share = totalServed > 0 ? totalOut / totalServed : 0;
  return totalOut >= 1_000 || share >= 0.01 ? "danger" : "warning";
}

/**
 * The 25-customer threshold controls alert prominence, not truth. A smaller
 * reported outage must still be named honestly instead of pairing a non-zero
 * gauge with "all served."
 */
export const SIGNIFICANT_POWER_OUTAGE_CUSTOMERS = 25;

export function powerOutageDisplay(
  totalOut: number,
  available: boolean,
): { countLabel: string; unit: string; quietDetail: string } {
  if (!available) {
    return {
      countLabel: "Feed unavailable",
      unit: "status unavailable",
      quietDetail: "Potomac Edison outage data could not be loaded right now.",
    };
  }
  if (totalOut <= 0) {
    return {
      countLabel: "No major outage",
      unit: "all served",
      quietDetail: "No significant power outages are reported right now.",
    };
  }
  const customerNoun = totalOut === 1 ? "customer" : "customers";
  const reportVerb = totalOut === 1 ? "is" : "are";
  if (totalOut < SIGNIFICANT_POWER_OUTAGE_CUSTOMERS) {
    return {
      countLabel: `${totalOut.toLocaleString("en-US")} reported`,
      unit: `${customerNoun} out`,
      quietDetail: `${totalOut.toLocaleString("en-US")} ${customerNoun} ${reportVerb} reported without power, below Radius's major-outage threshold.`,
    };
  }
  return {
    countLabel: `${totalOut.toLocaleString("en-US")} out`,
    unit: `${customerNoun} out`,
    quietDetail: `${totalOut.toLocaleString("en-US")} ${customerNoun} ${reportVerb} reported without power.`,
  };
}

export type PulseStatusSignals = {
  weather: boolean;
  fireRescue: boolean;
  traffic: boolean;
  power: boolean;
  schools: boolean;
  air: boolean;
  /** A current USGS reading at NWS action stage or higher. */
  flood: boolean;
  /** A fresh official police/public-safety release selected for breaking treatment. */
  police: boolean;
};

export function pulseUrgentFeedsDegraded(checks: {
  situationPartial: boolean;
  safetyUnavailable: boolean;
  officialAlertsComplete: boolean;
  riverCurrent: boolean;
}): boolean {
  return (
    checks.situationPartial ||
    checks.safetyUnavailable ||
    !checks.officialAlertsComplete ||
    !checks.riverCurrent
  );
}

export type PulseOperationalSignals = {
  marcAlerts: number;
  airportIssues: readonly string[];
  campDavidRestricted: boolean;
};

export type PulseOperationalBriefing = {
  active: boolean;
  line: string;
  sub: string;
};

/**
 * Describe meaningful service/access changes without escalating them into an
 * emergency. This is the middle state between "all quiet" and an advisory.
 */
export function pulseOperationalBriefing(
  signals: PulseOperationalSignals,
): PulseOperationalBriefing {
  const marcActive = signals.marcAlerts > 0;
  const airportsActive = signals.airportIssues.length > 0;
  const activeCount = Number(marcActive) + Number(airportsActive) + Number(signals.campDavidRestricted);

  if (activeCount === 0) {
    return {
      active: false,
      line: "No major disruptions appear in the checked feeds.",
      sub: "Open any condition below to see its source and latest details.",
    };
  }
  if (marcActive && activeCount === 1) {
    return {
      active: true,
      line: "MARC has a Brunswick Line service update.",
      sub: "Open MARC trains below for the affected service and current details.",
    };
  }
  if (airportsActive && activeCount === 1) {
    return {
      active: true,
      line: signals.airportIssues.length === 1
        ? `${signals.airportIssues[0]} is reporting a travel delay.`
        : "Regional airports are reporting travel delays.",
      sub: "Open Airports below to see which terminals are affected.",
    };
  }
  if (signals.campDavidRestricted && activeCount === 1) {
    return {
      active: true,
      line: "Camp David airspace restrictions are expanded.",
      sub: "Open the airspace update below for the affected area and current FAA details.",
    };
  }

  const details = [
    marcActive
      ? `${signals.marcAlerts} MARC service ${signals.marcAlerts === 1 ? "alert" : "alerts"}`
      : null,
    airportsActive
      ? `${signals.airportIssues.length} regional ${signals.airportIssues.length === 1 ? "airport has" : "airports have"} delays`
      : null,
    signals.campDavidRestricted ? "Camp David airspace is expanded" : null,
  ].filter((detail): detail is string => Boolean(detail));
  return {
    active: true,
    line: "Travel and access conditions have live updates.",
    sub: `${details.join(". ")}. Open an active item below for details.`,
  };
}

/**
 * The masthead and the breaking strip must read from the same situation model.
 * Keeping this as one named boundary prevents a newly promoted signal from
 * appearing below an "All clear" headline simply because it was omitted from
 * an inline boolean expression on the page.
 */
export function pulseStatusState(
  signals: PulseStatusSignals,
  urgentFeedsDegraded: boolean,
  operationalActive = false,
): {
  hasActive: boolean;
  hasOperational: boolean;
  heroDegraded: boolean;
  allClear: boolean;
} {
  const hasActive = Object.values(signals).some(Boolean);
  return {
    hasActive,
    hasOperational: operationalActive,
    heroDegraded: !hasActive && !operationalActive && urgentFeedsDegraded,
    allClear: !hasActive && !operationalActive && !urgentFeedsDegraded,
  };
}
