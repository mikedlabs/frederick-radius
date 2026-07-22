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

function aqiPriority(categoryId: number): number {
  if (categoryId >= 6) return 1; // Hazardous
  if (categoryId >= 5) return 4; // Very Unhealthy
  if (categoryId >= 4) return 5; // Unhealthy
  if (categoryId >= 3) return 6; // Unhealthy for Sensitive Groups
  return Number.POSITIVE_INFINITY;
}

/** A measured AQI can lead a low-priority statement, but never displace an
 * equally ranked or stronger warning such as a Tornado Warning. */
export function shouldAqiLead(
  categoryId: number,
  alert: PulseAlertSignal | null | undefined,
): boolean {
  const rank = aqiPriority(categoryId);
  if (!Number.isFinite(rank)) return false;
  return !alert || rank < pulseAlertPriority(alert);
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
