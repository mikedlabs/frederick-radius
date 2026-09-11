/**
 * Pure helpers for the /pulse board — kept framework-free so the count-up
 * formatting, the gauge fill math, and the segmented filter's active-set
 * resolution are unit-testable without a DOM. The board component and the
 * server page both read from here so one rule governs each behavior.
 */

export type PulseFilter = "all" | "attention" | "calm";

/** The five feeds that roll into the hero's "N situations" line. A tile is in
 *  the filter's "Needs attention" set iff it is one of these AND active — so
 *  the filter resolves to exactly the hero's active situations, never more. */
export const SITUATION_KEYS = [
  "alerts",
  "safety",
  "traffic",
  "power",
  "schools",
] as const;
export type SituationKey = (typeof SITUATION_KEYS)[number];

/** Given which situation feeds are active, the tile keys that "need attention".
 *  Mirrors the hero roll-up so the two never disagree. */
export function attentionTileKeys(
  active: Partial<Record<SituationKey, boolean>>,
): SituationKey[] {
  return SITUATION_KEYS.filter((k) => active[k]);
}

/**
 * Format a gauge's center number for its count-up. Whole numbers round;
 * decimals are fixed; `comma` groups thousands (power outages read "1,240",
 * never "1240"). Kept pure so the count-up frames and the final rest state
 * format identically.
 */
export function formatGaugeNumber(
  value: number,
  opts: { decimals?: number; comma?: boolean } = {},
): string {
  const decimals = opts.decimals ?? 0;
  const rounded = decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
  if (opts.comma) {
    return rounded.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return decimals > 0 ? rounded.toFixed(decimals) : String(rounded);
}

/** Clamp any raw ratio into a 0–100 gauge fill (guards NaN / Infinity to 0). */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export type FilterableTile = { key: string; attention: boolean };

/** The tiles a given filter shows. "All" is everything; "Needs attention" is
 *  the attention set; "Calm" is its complement. */
export function filterTiles<T extends FilterableTile>(
  tiles: T[],
  filter: PulseFilter,
): T[] {
  if (filter === "attention") return tiles.filter((t) => t.attention);
  if (filter === "calm") return tiles.filter((t) => !t.attention);
  return tiles;
}

/** Honest empty-state copy when a filter resolves to no tiles. */
export function emptyMessage(filter: PulseFilter): string {
  return filter === "attention"
    ? "Nothing needs attention right now. That is the good kind of quiet."
    : "There is nothing to show here.";
}
