import type { SearchResult } from "@/lib/search/index";

/**
 * Mobile map search deliberately shows three rows plus the full-results
 * handoff. Keep that limit in rendering as well as CSS so keyboard navigation
 * can never select an option a sighted user cannot see.
 */
export function mapSearchResultLimit(viewportWidth: number): 3 | 4 {
  return viewportWidth <= 520 ? 3 : 4;
}

/**
 * Results that require a working renderer must disappear with the renderer.
 * Place, event, category, municipality, and non-map action links remain useful
 * in the readable fallback; layer commands and temporary provider spots do not.
 */
export function mapSearchResultsForRenderer(
  results: readonly SearchResult[],
  mapAvailable: boolean,
): SearchResult[] {
  if (mapAvailable) return [...results];

  return results.filter(
    (result) =>
      !result.temporary &&
      !result.id.startsWith("layer:") &&
      !(
        result.type === "action" &&
        (result.id === "action:map" ||
          result.id.startsWith("action:map-") ||
          result.href === "/map" ||
          result.href.startsWith("/map?"))
      ),
  );
}
