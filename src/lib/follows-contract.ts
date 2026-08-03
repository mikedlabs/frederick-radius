/**
 * Saved-place account contract.
 *
 * One hundred places is intentionally generous for a personal field guide and
 * keeps the Saved server payload, client store, and by-slug lookup bounded.
 * Existing accounts above the limit are never deleted: reads return their most
 * recent one hundred and mark the snapshot as truncated so the UI can say so.
 */
export const MAX_FOLLOWED_PLACES = 100;
export const MAX_FOLLOW_SLUG_LENGTH = 120;

/**
 * Normalize an ordered slug list without changing its relevance order.
 * Callers decide whether their input is recent-first before using this helper.
 */
export function normalizeFollowSlugs(
  values: readonly unknown[],
  limit = MAX_FOLLOWED_PLACES,
): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const slug = value.trim();
    if (
      !slug
      || slug.length > MAX_FOLLOW_SLUG_LENGTH
      || seen.has(slug)
    ) {
      continue;
    }
    seen.add(slug);
    normalized.push(slug);
    if (normalized.length >= limit) break;
  }

  return normalized;
}
