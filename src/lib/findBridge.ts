export type FindTarget = "global" | "map";

type FindWindow = Window & { __frPendingFind?: FindTarget };

/**
 * Keep a Find request until the surface that owns it is ready. The mobile
 * navigation and a heavy map can hydrate at different times; a plain custom
 * event disappears when it fires before the receiver subscribes.
 */
export function requestFind(target: FindTarget): void {
  const win = window as FindWindow;
  win.__frPendingFind = target;
  win.dispatchEvent(new CustomEvent(target === "map" ? "fr:focus-map-search" : "fr:open-search"));
}

export function consumeFindRequest(target: FindTarget): boolean {
  const win = window as FindWindow;
  if (win.__frPendingFind !== target) return false;
  delete win.__frPendingFind;
  return true;
}
