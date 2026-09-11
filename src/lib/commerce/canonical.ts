/**
 * Parameters used by site builders and commerce providers to attribute a
 * click. They do not identify a different menu, order flow, or reservation.
 */
const TRACKING_QUERY_KEYS = new Set([
  "destination",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ot_source",
  "promotion",
  "source",
  "spot_id",
]);

function isTrackingQueryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.startsWith("utm_") ||
    normalized === "utmcampaign" ||
    TRACKING_QUERY_KEYS.has(normalized)
  );
}

/**
 * Stable identity for a commerce destination. HTTPS upgrades, `www`, a
 * trailing slash, a fragment, and tracking parameters do not create a second
 * user action.
 */
export function commerceDestinationKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    return null;
  }

  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (isTrackingQueryKey(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  const query = url.searchParams.toString();
  return `${host}${path}${query ? `?${query}` : ""}`;
}

type CommerceLike = {
  type: string;
  url: string;
};

const ACTION_PRIORITY: Record<string, number> = {
  order: 5,
  reservation: 4,
  menu: 3,
  catering: 2,
  gift_card: 1,
};

function urlQuality(rawUrl: string): number {
  try {
    const url = new URL(rawUrl);
    let score = url.protocol === "https:" ? 20 : 0;
    for (const key of url.searchParams.keys()) {
      score += isTrackingQueryKey(key) ? -3 : 1;
    }
    return score - rawUrl.length / 10_000;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

/**
 * Keep one meaningful action per destination. When the same provider page is
 * labelled both "Menu" and "Order", prefer the stronger action; when URLs
 * differ only by tracking or HTTP, prefer the cleaner encrypted URL.
 */
export function dedupeCommerceDestinations<T extends CommerceLike>(
  links: readonly T[],
): T[] {
  const selected = new Map<
    string,
    { link: T; firstIndex: number; quality: number }
  >();

  links.forEach((link, index) => {
    const key = commerceDestinationKey(link.url);
    if (!key) return;
    const quality =
      (ACTION_PRIORITY[link.type] ?? 0) * 100 + urlQuality(link.url);
    const prior = selected.get(key);
    if (!prior) {
      selected.set(key, { link, firstIndex: index, quality });
      return;
    }
    if (quality > prior.quality) {
      selected.set(key, {
        link,
        firstIndex: prior.firstIndex,
        quality,
      });
    }
  });

  return [...selected.values()]
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .map(({ link }) => link);
}
