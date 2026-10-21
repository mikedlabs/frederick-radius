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

/** Consume a cold-place camera request once. Generated `c` parameters are not
 * entry intent; a saved entry camera, newer selection or deliberate camera
 * owner always wins. Call only after the renderer and selected card mount. */
export function consumeInitialPlaceCameraFocus(
  pending: { current: string | null },
  {
    selectedSlug,
    liveSearch,
    hasEntryCamera,
    hasUserCameraIntent,
    hasOtherCameraOwner,
  }: {
    selectedSlug: string | null;
    liveSearch: string;
    hasEntryCamera: boolean;
    hasUserCameraIntent: boolean;
    hasOtherCameraOwner: boolean;
  },
): boolean {
  const slug = pending.current;
  pending.current = null;
  return Boolean(
    slug &&
      selectedSlug === slug &&
      new URLSearchParams(liveSearch).get("place") === slug &&
      !hasEntryCamera &&
      !hasUserCameraIntent &&
      !hasOtherCameraOwner,
  );
}
