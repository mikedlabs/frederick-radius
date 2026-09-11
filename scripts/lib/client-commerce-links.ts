import type { CommerceLink } from "../../src/lib/commerce/types";

/**
 * Merge reviewed business-info links into the generated client place record.
 *
 * The curated place link wins an exact duplicate. Supplemental links keep only
 * the fields a client action or trust label can use; extraction notes and the
 * repeated place slug remain in the server-side source artifact.
 */
export function mergeClientCommerceLinks(
  curated: readonly CommerceLink[] | undefined,
  supplemental: readonly CommerceLink[],
): CommerceLink[] | undefined {
  const links: CommerceLink[] = [...(curated ?? [])];
  const seen = new Set(
    links.map((link) => `${link.type}::${link.url.trim()}`),
  );

  for (const link of supplemental) {
    const url = link.url.trim();
    if (!url) continue;
    const key = `${link.type}::${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      provider: link.provider,
      type: link.type,
      url,
      ...(link.label ? { label: link.label } : {}),
      ...(link.is_primary ? { is_primary: true } : {}),
      ...(link.is_verified ? { is_verified: true } : {}),
      ...(link.last_verified_at
        ? { last_verified_at: link.last_verified_at }
        : {}),
      ...(link.source ? { source: link.source } : {}),
    });
  }

  return links.length > 0 ? links : undefined;
}
