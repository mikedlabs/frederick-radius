/**
 * A category mismatch is resolved only by a human category decision or by
 * quarantining the entire mismatched enrichment identity.
 *
 * `clearGoogle` is intentionally absent: it clears borrowed rating data after
 * decoration, but it does not reject the provider's category/type fields.
 */
export type CategoryDispositionPatch = {
  category?: string;
  clearEnrichment?: boolean;
  clearGoogle?: boolean;
};

export function hasCategoryDisposition(
  patch: CategoryDispositionPatch | undefined,
): boolean {
  return Boolean(patch?.category || patch?.clearEnrichment);
}
