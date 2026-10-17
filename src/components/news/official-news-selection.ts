import type { CivicPressItem, OfficialCivicNewsResult } from "@/lib/integrations/civic-press";

function dated(item: CivicPressItem): boolean {
  return Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) > 0;
}

/** Compact Today shows both newsrooms when each has a usable dated result.
 * Current source checks take precedence over retained, unverified reports;
 * if no subscription is verified, older reports keep their original dates.
 */
export function officialNewsSelection(result: OfficialCivicNewsResult, limit: number): CivicPressItem[] {
  const current = result.sources?.filter((source) => source.status !== "unavailable") ?? [];
  const usablePublishers = new Set(current.filter((source) => source.status === "available").map((source) => source.source));
  const usableFeeds = new Set(current.filter((source) => source.status === "available").map((source) => source.id));
  const seen = new Set<string>();
  const items = result.items.filter((item) => item.lane === "civic" &&
    (!current.length || (item.sourceId ? usableFeeds.has(item.sourceId) : usablePublishers.has(item.source))))
    .sort((a, b) => (dated(b) ? Date.parse(b.publishedAt) : 0) - (dated(a) ? Date.parse(a.publishedAt) : 0))
    .filter((item) => { if (seen.has(item.url)) return false; seen.add(item.url); return true; });
  if (limit === 2 && usablePublishers.size === 2) {
    const latestCity = items.find((item) => item.source === "City of Frederick" && dated(item));
    const latestCounty = items.find((item) => item.source === "Frederick County" && dated(item));
    if (latestCity && latestCounty) return items.filter((item) => item === latestCity || item === latestCounty);
  }
  return items.slice(0, Math.max(0, limit));
}
