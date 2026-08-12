import { alertPriority } from "@/lib/alert-priority";

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
  | "air";

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
  "fire-rescue": 2,
  police: 3,
  schools: 4,
  traffic: 5,
  power: 6,
  air: 7,
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
  if (totalOut < 25) {
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
  /** A fresh official police/public-safety release selected for breaking treatment. */
  police: boolean;
};

/**
 * The masthead and the breaking strip must read from the same situation model.
 * Keeping this as one named boundary prevents a newly promoted signal from
 * appearing below an "All clear" headline simply because it was omitted from
 * an inline boolean expression on the page.
 */
export function pulseStatusState(
  signals: PulseStatusSignals,
  urgentFeedsDegraded: boolean,
): { hasActive: boolean; heroDegraded: boolean; allClear: boolean } {
  const hasActive = Object.values(signals).some(Boolean);
  return {
    hasActive,
    heroDegraded: !hasActive && urgentFeedsDegraded,
    allClear: !hasActive && !urgentFeedsDegraded,
  };
}
