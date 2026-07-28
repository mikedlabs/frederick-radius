export type MapUrlMutation = (params: URLSearchParams) => void;

/**
 * Build a map URL change from the address bar that is live at the exact
 * moment of the interaction.
 *
 * The map writes camera, query, and layer state between React renders. A
 * `useSearchParams()` snapshot can therefore be one interaction behind and
 * must not be used as the base for a later filter change.
 */
export function mapUrlAfterMutation(
  currentHref: string,
  mutate: MapUrlMutation,
): URL {
  const next = new URL(currentHref);
  mutate(next.searchParams);
  return next;
}

/**
 * Replace the current map URL without adding a history entry.
 *
 * Next patches the native History API and, for an external `replaceState`
 * call, copies its private router tree before synchronizing
 * `useSearchParams()`. Passing the existing `history.state` back would carry
 * Next's internal marker and intentionally bypass that synchronization.
 */
export function replaceMapUrl(mutate: MapUrlMutation): URL | null {
  if (typeof window === "undefined") return null;
  const next = mapUrlAfterMutation(window.location.href, mutate);
  window.history.replaceState(null, "", next);
  return next;
}

