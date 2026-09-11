export const MAP_LOCATION_INTRO_STORAGE_KEY = "fr_map_location_intro_v1";

const MAP_TASK_PARAMS = [
  "amenity",
  "at",
  "c",
  "deals",
  "in",
  "intent",
  "layers",
  "mode",
  "music",
  "open",
  "place",
  "q",
  "scene",
  "show",
  "sub",
  "t",
] as const;

export type MapLocationAvailability =
  | "available"
  | "requestable"
  | "unavailable";

export function shouldShowMapLocationIntro({
  isBrowseMap,
  permissionChecked,
  hasLocation,
  availability,
  dismissed,
}: {
  isBrowseMap: boolean;
  permissionChecked: boolean;
  hasLocation: boolean;
  availability: MapLocationAvailability;
  dismissed: boolean;
}): boolean {
  return (
    isBrowseMap &&
    permissionChecked &&
    !hasLocation &&
    availability === "requestable" &&
    !dismissed
  );
}

/** A shared or task-specific map link already tells Radius how to begin.
 * Keep first-use guidance for a bare map entry, but never lay it over the
 * result, camera, reset control, or live layer someone deliberately opened. */
export function shouldOfferMapLocationForUrl(
  searchParams: Pick<URLSearchParams, "has">,
): boolean {
  return !MAP_TASK_PARAMS.some((key) => searchParams.has(key));
}

export function readMapLocationIntroDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MAP_LOCATION_INTRO_STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export function rememberMapLocationIntroDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MAP_LOCATION_INTRO_STORAGE_KEY, "dismissed");
  } catch {
    // The current session can still dismiss the prompt when storage is blocked.
  }
}
