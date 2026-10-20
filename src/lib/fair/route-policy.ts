export const FAIR_DAY_CANONICAL_PATH =
  "/moments/great-frederick-fair-2026" as const;
export const FAIR_DAY_SHORT_PATH = "/fair" as const;

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Both public Fair entrances share one low-request runtime policy. */
export function isFairDayPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === FAIR_DAY_SHORT_PATH ||
    normalized === FAIR_DAY_CANONICAL_PATH;
}

/** Fair Day owns a dedicated task shell instead of inheriting the site chrome. */
export function shouldShowGlobalAppChrome(pathname: string): boolean {
  return !isFairDayPath(pathname);
}

/** Fair Day stays low-request. Native detail Back can depart during hydration,
 * so canonical detail pages also wait for a real tab activation to load it. */
export function shouldPrefetchGlobalNavigation(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  const canonicalDetail = /^\/(?:events|places)\/[^/]+$/.test(normalized)
    && normalized !== "/events/calendar";
  return !isFairDayPath(pathname) && !canonicalDetail;
}

/** High-frequency first-party activity posts stay off the Fair hot path. */
export function shouldPostAutomaticActivity(pathname: string): boolean {
  return !isFairDayPath(pathname);
}
