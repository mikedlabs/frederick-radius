/** Keep a browser GPS accuracy halo useful without overstating precision or
 * allowing a poor fix to cover the entire county view. */
export function clampLocationAccuracy(accuracyM: number | null): number | null {
  if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= 0) return null;
  return Math.min(1_000, Math.max(12, Math.round(accuracyM)));
}
