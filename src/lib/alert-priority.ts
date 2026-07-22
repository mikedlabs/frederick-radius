import { summarizeAirQualityAlert } from "@/lib/air-quality";

/** The common alert shape used by NWS, Pulse, and Today. */
export type AlertSignal = {
  event: string;
  headline?: string;
  description?: string;
  severity?: string;
};

/** Lower numbers are more consequential. */
export function alertPriority(alert: AlertSignal): number {
  const copy = `${alert.event} ${alert.headline ?? ""} ${alert.description ?? ""}`;
  if (/tornado|flash flood|severe thunderstorm|hurricane|tropical storm|blizzard|ice storm|extreme wind|snow squall/i.test(copy)
      && /warning|emergency/i.test(copy)) return 0;
  if (alert.severity === "Extreme") return 1;
  if (alert.severity === "Severe" && !/air quality/i.test(copy)) return 2;
  const air = summarizeAirQualityAlert({
    event: alert.event,
    headline: alert.headline ?? "",
    description: alert.description ?? "",
  });
  if (air) {
    if (air.level === "maroon" || air.level === "purple") return 3;
    if (air.level === "red") return 5;
    if (air.level === "orange") return 6;
    // Descriptive severity is a fallback only when there is no operative
    // issued code. A Code Orange bulletin may discuss an earlier Purple period.
    if (!air.level && /hazardous|very unhealthy/i.test(copy)) return 3;
    if (!air.level && /\bunhealthy\b.*general population/i.test(copy)) return 5;
    return 6;
  }
  if (/\bwarning\b/i.test(copy)) return 4;
  return 7;
}

function productPriority(alert: AlertSignal): number {
  const copy = `${alert.event} ${alert.headline ?? ""}`;
  if (/\b(?:warning|emergency)\b/i.test(copy)) return 0;
  if (/\bwatch\b/i.test(copy)) return 1;
  if (/\badvisory\b/i.test(copy)) return 2;
  return 3;
}

function hazardPriority(alert: AlertSignal): number {
  const copy = `${alert.event} ${alert.headline ?? ""}`;
  if (/\btornado\b/i.test(copy)) return 0;
  if (/\bsevere thunderstorm\b/i.test(copy)) return 1;
  if (/\bflash flood\b/i.test(copy)) return 2;
  if (/\bflood\b/i.test(copy)) return 3;
  if (/\b(?:hurricane|tropical storm)\b/i.test(copy)) return 4;
  if (/\b(?:blizzard|ice storm|snow squall)\b/i.test(copy)) return 5;
  return 6;
}

/**
 * Shared worst-first comparator. The broad consequence rank remains the first
 * decision. Product type and hazard kind break ties so two Severe watches do
 * not lead different Today surfaces merely because the feed order changed.
 */
export function compareAlertPriority(a: AlertSignal, b: AlertSignal): number {
  return alertPriority(a) - alertPriority(b)
    || productPriority(a) - productPriority(b)
    || hazardPriority(a) - hazardPriority(b);
}

export function prioritizeAlerts<T extends AlertSignal>(alerts: readonly T[]): T[] {
  return [...alerts].sort(compareAlertPriority);
}
