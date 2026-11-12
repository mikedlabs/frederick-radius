/** A complete canonical name, never a prefix, fuzzy match, or alias.
 * Kept independent of the catalog so Find can use the same identity rule. */
export function isExactPlaceNameQuery(query: string, name: string): boolean {
  const key = (value: string) => value.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const queryKey = key(query);
  return queryKey.length > 0 && queryKey === key(name);
}
