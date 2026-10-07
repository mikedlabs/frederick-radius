export type FindTarget = "global" | "map";

type FindWindow = Window & {
  __frPendingFind?: FindTarget;
  __frPendingFindQuery?: string;
};

/**
 * Keep a search request until the surface that owns it is ready. The header
 * action and a heavy map can hydrate at different times; a plain custom event
 * disappears when it fires before the receiver subscribes.
 *
 * A launcher that already holds the person's words (Compass's filter, for
 * example) passes them as `query` so the one Find overlay opens on them
 * instead of asking for them again.
 */
export function requestFind(target: FindTarget, query?: string): void {
  const win = window as FindWindow;
  win.__frPendingFind = target;
  const words = query?.trim();
  if (words) win.__frPendingFindQuery = words;
  else delete win.__frPendingFindQuery;
  win.dispatchEvent(new CustomEvent(target === "map" ? "fr:focus-map-search" : "fr:open-search"));
}

export function consumeFindRequest(target: FindTarget): boolean {
  const win = window as FindWindow;
  if (win.__frPendingFind !== target) return false;
  delete win.__frPendingFind;
  return true;
}

/** The words handed over with the latest Find request, read once. */
export function consumeFindQuery(): string | null {
  const win = window as FindWindow;
  const query = win.__frPendingFindQuery ?? null;
  delete win.__frPendingFindQuery;
  return query;
}
