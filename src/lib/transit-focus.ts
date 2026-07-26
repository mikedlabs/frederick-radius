export const TRANSIT_ROUTE_FOCUS_EVENT = "fr:transit-route-focus";
const TRANSIT_ROUTE_FOCUS_KEY = "fr:transit-route-focus:v1";

export type TransitRouteFocusDetail = {
  routeId: string;
};

/**
 * The route finder can hydrate before the deferred Mapbox chunk. Keep one
 * pending selection in session storage as well as dispatching the live event,
 * so a tap made during that gap is not lost.
 */
export function requestTransitRouteFocus(routeId: string): void {
  try {
    window.sessionStorage.setItem(TRANSIT_ROUTE_FOCUS_KEY, routeId);
  } catch {
    // The live event still works when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<TransitRouteFocusDetail>(TRANSIT_ROUTE_FOCUS_EVENT, {
      detail: { routeId },
    }),
  );
}

export function takePendingTransitRouteFocus(): string | null {
  try {
    const routeId = window.sessionStorage.getItem(TRANSIT_ROUTE_FOCUS_KEY);
    window.sessionStorage.removeItem(TRANSIT_ROUTE_FOCUS_KEY);
    return routeId;
  } catch {
    return null;
  }
}

export function clearPendingTransitRouteFocus(): void {
  try {
    window.sessionStorage.removeItem(TRANSIT_ROUTE_FOCUS_KEY);
  } catch {
    // No action required.
  }
}
