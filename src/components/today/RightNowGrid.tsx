"use client";

import { useSyncExternalStore } from "react";
import { type PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import PlaceCard from "@/components/place/PlaceCard";
import { getInterests } from "@/lib/personalize";

/**
 * RightNowGrid — client wrapper for the RightNow rail's place grid.
 *
 * Takes the server-picked, time-of-day-filtered candidate pool and
 * reorders it so places matching the user's onboarding interests
 * (Phase D step 3) bubble to the top. The set of places never changes
 * — just the order. A user who picked "Outdoors" still sees the
 * restaurant picks if the slot is dinner-leaning, just below their
 * parks/trails matches first.
 *
 * Pure client reorder; the server keeps doing the heavy filtering +
 * round-robin-across-towns picking. Reading via useSyncExternalStore
 * means the server snapshot is empty (= unchanged order), so the
 * un-personalized first paint matches the personalized re-order.
 */

const subscribeNoop = () => () => {};

/**
 * Resolve a place's category slug to its TOP-LEVEL umbrella, matching
 * the interest slugs stored on /welcome (food / outdoors / arts / etc.).
 * Mirrors the same groupKeyFor pattern RadiusBuilder uses so the two
 * surfaces agree on what counts as "in this interest."
 */
function topLevelCategory(slug: string): string {
  const def = CATEGORY_BY_SLUG[slug];
  if (!def) return slug;
  return def.parent ?? def.slug;
}

function reorderByInterests(
  picks: PlaceCardData[],
  interests: Set<string>,
): PlaceCardData[] {
  if (interests.size === 0) return picks;
  const matched: PlaceCardData[] = [];
  const other: PlaceCardData[] = [];
  for (const p of picks) {
    if (interests.has(topLevelCategory(p.category))) matched.push(p);
    else other.push(p);
  }
  return [...matched, ...other];
}

export default function RightNowGrid({ picks }: { picks: PlaceCardData[] }) {
  const interests = useSyncExternalStore(
    subscribeNoop,
    () => new Set(getInterests()),
    () => new Set<string>(),
  );
  const ordered = reorderByInterests(picks, interests);

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {ordered.map((p) => (
        <PlaceCard key={p.slug} place={p} variant="grid" />
      ))}
    </div>
  );
}
