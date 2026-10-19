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
 * Camera commits can preserve their current history ownership while still
 * taking Next's external update path. Other callers retain their existing
 * state-reset behavior unless they explicitly opt in.
 */
export function replaceMapUrl(
  mutate: MapUrlMutation,
  { preserveHistoryState = false }: { preserveHistoryState?: boolean } = {},
): URL | null {
  if (typeof window === "undefined") return null;
  const next = mapUrlAfterMutation(window.location.href, mutate);
  const currentState: unknown = window.history.state;
  let nextState: Record<string, unknown> | null = null;
  if (
    preserveHistoryState &&
    currentState !== null &&
    typeof currentState === "object" &&
    !Array.isArray(currentState)
  ) {
    nextState = { ...(currentState as Record<string, unknown>) };
    // These markers bypass Next's external History bridge. Let the installed
    // bridge copy its authoritative router fields onto our custom-state copy.
    delete nextState.__NA;
    delete nextState._N;
    delete nextState.__PRIVATE_NEXTJS_INTERNALS_TREE;
  }
  window.history.replaceState(nextState, "", next);
  return next;
}

/**
 * Replace presentation-only map state without asking Next to re-render the
 * route.
 *
 * Camera and foreground selections already live in the mounted map. They only
 * need to be reflected in the address bar for sharing and return links. Keep
 * Next's private history marker for these updates so selecting a pin cannot
 * turn a responsive map into a route refresh while a detail sheet is opening.
 */
export function replaceMapUrlSilently(mutate: MapUrlMutation): URL | null {
  if (typeof window === "undefined") return null;
  const next = mapUrlAfterMutation(window.location.href, mutate);
  window.history.replaceState(window.history.state, "", next);
  return next;
}
