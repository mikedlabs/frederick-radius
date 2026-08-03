/**
 * Mobile map search deliberately shows three rows plus the full-results
 * handoff. Keep that limit in rendering as well as CSS so keyboard navigation
 * can never select an option a sighted user cannot see.
 */
export function mapSearchResultLimit(viewportWidth: number): 3 | 4 {
  return viewportWidth <= 520 ? 3 : 4;
}
