/**
 * Curated civic advisories — the human channel for hyper-local road work,
 * closures, and emergency notices the automated feeds miss.
 *
 * The live Pulse feeds skew to state highways (MDOT CHART) and county-wide
 * weather (NWS); a water-main emergency on a downtown CITY street between
 * two cross streets is exactly the kind of thing none of them carry. This
 * file is where a curator (the same human-correction pattern as
 * places-overrides.json) drops one, and it surfaces in Pulse's existing
 * "Road work & closures" card with zero new UI.
 *
 * Honest by construction: every entry carries a window, and an alert is
 * only emitted while `startsAt <= now <= expiresAt`. A past event simply
 * stops rendering — no stale "emergency" ever ships, even if nobody prunes
 * the file. Authored copy follows the house voice (no em dashes).
 *
 * Shape note: we emit `CivicPressItem` so the curated entries merge straight
 * into `advisoryReleases(press)` and render through the same AdvisoryCard.
 * The only synthetic fields are `lane: "advisory"` and `publishedAt`
 * (we use `startsAt` so the card's relative-time line reads sensibly).
 */
import RAW from "@/data/civic-alerts.json" with { type: "json" };
import type { CivicPressItem } from "./civic-press";

export type CuratedAlert = {
  id: string;
  title: string;
  source: CivicPressItem["source"];
  url: string;
  startsAt: string;
  expiresAt: string;
};

const ALERTS: CuratedAlert[] = (RAW as { alerts?: CuratedAlert[] }).alerts ?? [];

function sourceShort(source: CivicPressItem["source"]): CivicPressItem["sourceShort"] {
  return source === "Frederick County" ? "County" : "City";
}

/**
 * Active curated advisories as CivicPressItems, newest window first.
 * `now` is passed in (not read here) so the caller's per-request clock
 * drives expiry and the function stays pure + unit-testable. `alerts`
 * defaults to the curated file but is injectable for tests.
 */
export function getCuratedAdvisories(
  now: number,
  alerts: CuratedAlert[] = ALERTS,
): CivicPressItem[] {
  return alerts.filter((a) => {
    const start = Date.parse(a.startsAt);
    const end = Date.parse(a.expiresAt);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return start <= now && now <= end;
  })
    .map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source,
      sourceShort: sourceShort(a.source),
      publishedAt: a.startsAt,
      lane: "advisory" as const,
    }))
    .sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt));
}
