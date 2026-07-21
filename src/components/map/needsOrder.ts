/**
 * Time-aware ordering for the map's "Most needed" shortcuts.
 *
 * Defaults are the product: most sessions never type, so the zero-input state
 * should already lead with what THIS hour most likely needs — coffee and
 * restrooms in the morning, food and parking at dinner, what's-open and
 * restrooms late at night.
 *
 * Habituation constraint (deliberate): the two anchors — Open now and
 * Near me — are pinned first and NEVER move, so muscle memory can form on the
 * controls people tap most. Only the content tail reorders by daypart.
 * (Content may reorder; controls never move.)
 *
 * Pure module (no React, no icons) so the ordering is unit-testable.
 */

export type NeedKindKey = { kind: string; key?: string };

export type NeedDaypart = "morning" | "midday" | "afternoon" | "evening" | "late";

/** Eastern wall-clock hour → daypart bucket for the needs row. */
export function needDaypart(hour: number): NeedDaypart {
  if (hour >= 5 && hour <= 10) return "morning";
  if (hour >= 11 && hour <= 14) return "midday";
  if (hour >= 15 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 21) return "evening";
  return "late";
}

/** Tail order per daypart. Keys are intent/amenity keys, plus the literal
 *  kinds ("parking") for needs that aren't keyed. Anything not listed sorts
 *  after the listed set in its incoming order (a new need degrades gracefully
 *  instead of vanishing). */
const TAIL_ORDER: Record<NeedDaypart, readonly string[]> = {
  morning: ["coffee", "restroom", "outdoor", "eat", "parking", "water", "wifi", "family"],
  midday: ["eat", "coffee", "parking", "restroom", "outdoor", "wifi", "water", "family"],
  afternoon: ["coffee", "outdoor", "family", "eat", "restroom", "water", "parking", "wifi"],
  evening: ["eat", "parking", "restroom", "coffee", "outdoor", "family", "wifi", "water"],
  late: ["eat", "restroom", "parking", "wifi", "coffee", "water", "outdoor", "family"],
};

const needKey = (n: NeedKindKey): string => n.key ?? n.kind;

export function orderNeedsForHour<T extends NeedKindKey>(
  needs: readonly T[],
  hour: number,
): T[] {
  const rank = TAIL_ORDER[needDaypart(hour)];
  const anchors = needs.filter((n) => n.kind === "opennow" || n.kind === "nearme");
  const tail = needs
    .filter((n) => n.kind !== "opennow" && n.kind !== "nearme")
    .map((n, i) => {
      const r = rank.indexOf(needKey(n));
      return { n, r: r === -1 ? rank.length + i : r };
    })
    .sort((a, b) => a.r - b.r)
    .map((x) => x.n);
  return [...anchors, ...tail];
}
