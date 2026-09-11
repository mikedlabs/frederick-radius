/**
 * Golden-hour window — the gate for the almanac card that surfaces today's
 * sunset and the ~hour of good light before it.
 *
 * Only the pre-sunset window is worth a card: from ~90 min before golden hour
 * opens (enough lead to grab the camera / pick a patio) through sunset. Outside
 * that — the middle of the day, the dead of night — it returns null and the
 * card renders nothing. Every minute is real NOAA sun math (lib/sun), never a
 * guessed time. Pure + deterministic so the gate is unit-tested.
 */
import { sunTimes } from "@/lib/sun";

/** How early, before golden hour opens, the card starts previewing the light. */
const LEAD_MS = 90 * 60_000;

export type GoldenWindow = {
  /** When the good light begins (sun at +6°). */
  goldenStart: Date;
  /** Tonight's sunset. */
  sunset: Date;
  /** True once golden hour is actually underway (now ≥ goldenStart). */
  active: boolean;
};

/**
 * The active golden-hour window for `now`, or null when it isn't the moment for
 * the card (before the lead-in, or after sunset, or when the sun math is
 * unavailable). Returns the light window so the caller can name the times.
 */
export function goldenHourWindow(now: Date, lat: number, lng: number): GoldenWindow | null {
  const t = sunTimes(now, lat, lng);
  if (!t.goldenEveningStart || !t.sunset) return null;
  if (now >= t.sunset) return null; // sun's down — no light left to promise
  if (now.getTime() < t.goldenEveningStart.getTime() - LEAD_MS) return null; // too early
  return {
    goldenStart: t.goldenEveningStart,
    sunset: t.sunset,
    active: now >= t.goldenEveningStart,
  };
}
