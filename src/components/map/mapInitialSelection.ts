/** A late renderer load cannot replay a mount-time entity over newer intent.
 * Read the live address bar at the call site, not a lagging router snapshot. */
export function shouldApplyInitialMapSelection(
  kind: "place" | "event",
  slug: string,
  liveSearch: string,
  alreadyOpenSlug: string | null,
): boolean {
  if (alreadyOpenSlug === slug) return false;
  const params = new URLSearchParams(liveSearch);
  if (kind === "place") return params.get("place") === slug;
  return !params.get("place") && params.get("event") === slug;
}
