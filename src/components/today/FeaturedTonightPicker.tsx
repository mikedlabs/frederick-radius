"use client";

import { useSyncExternalStore } from "react";
import { type PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import FeaturedTonight from "./FeaturedTonight";
import { getInterestsSet } from "@/lib/personalize";

// Reference-stable empty set for the server snapshot. Reusing the same
// object on every call is what useSyncExternalStore requires; allocating
// a new Set per snapshot is what tipped this component into the
// "Maximum update depth exceeded" loop.
const EMPTY_INTERESTS = new Set<string>();

/**
 * FeaturedTonightPicker — client-side selector that picks the best
 * Featured Tonight candidate for the current user from the server's
 * shortlist of top contenders.
 *
 * The server pre-picks up to 5 high-rated, photogenic, evening-
 * category candidates and passes them in. Without personalization,
 * the user always sees candidates[0] (the highest-ranked, same as
 * before this wrapper existed). With interests set, the first
 * candidate whose top-level umbrella matches a chosen interest wins;
 * the rest fall through to the rating-sorted default.
 *
 * SSR-safe via useSyncExternalStore: server snapshot is an empty
 * interest set, so the server-rendered card matches candidates[0]
 * with no hydration mismatch. The personalized swap happens after
 * mount when a different candidate wins.
 */

const subscribeNoop = () => () => {};

function topLevelCategory(slug: string): string {
  const def = CATEGORY_BY_SLUG[slug];
  if (!def) return slug;
  return def.parent ?? def.slug;
}

export default function FeaturedTonightPicker({
  candidates,
}: {
  candidates: PlaceCardData[];
}) {
  const interests = useSyncExternalStore(
    subscribeNoop,
    getInterestsSet,
    () => EMPTY_INTERESTS,
  );

  if (candidates.length === 0) return null;
  // No interests → behave exactly like the prior code path (top
  // candidate wins). This means a returning user with no Phase D
  // picks sees the same Featured Tonight they always did.
  if (interests.size === 0) return <FeaturedTonight place={candidates[0]} />;

  const matched = candidates.find((p) =>
    interests.has(topLevelCategory(p.category)),
  );
  return <FeaturedTonight place={matched ?? candidates[0]} />;
}
