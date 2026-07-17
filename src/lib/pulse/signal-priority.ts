export type PulseAlertSignal = {
  event: string;
  headline: string;
  description: string;
  severity: string;
};

/** Lower numbers are more consequential. This compares unlike NWS products
 * only for the Pulse lead; the official detail remains intact in the tile. */
export function pulseAlertPriority(a: PulseAlertSignal): number {
  const copy = `${a.event} ${a.headline} ${a.description}`;
  if (/tornado|flash flood|severe thunderstorm|hurricane|tropical storm|blizzard|ice storm|extreme wind|snow squall/i.test(copy)
      && /warning|emergency/i.test(copy)) return 0;
  if (a.severity === "Extreme") return 1;
  if (a.severity === "Severe" && !/air quality/i.test(copy)) return 2;
  if (/code\s*maroon|hazardous|code\s*purple|very unhealthy/i.test(copy)) return 3;
  if (/\bwarning\b/i.test(copy)) return 4;
  if (/code\s*red|\bunhealthy\b.*general population/i.test(copy)) return 5;
  if (/air quality|smoke|ozone|code\s*orange/i.test(copy)) return 6;
  return 7;
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
