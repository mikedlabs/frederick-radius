"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getInterests } from "@/lib/personalize";

/**
 * InterestsChip — a small companion to HomeMuniChip that surfaces the
 * second Phase D pick (umbrella categories the user said they care
 * about). Renders nothing if the user skipped the interests step.
 *
 * Tap-through opens /radius, since Radius is where interests actually
 * change behavior right now (the matching umbrella sections come
 * pre-expanded on first paint). When the interest signal feeds more
 * surfaces (RightNow rail bias, /discover gem weighting), this chip
 * stays the right ambient indicator either way.
 *
 * SSR-safe via useSyncExternalStore: null on the server + pre-hydration,
 * so no hydration mismatch and no flash of wrong content.
 */

const subscribeNoop = () => () => {};

// Label set must mirror INTEREST_OPTIONS in WelcomeFlow.tsx — same
// slugs, friendly display labels. Keeping it inline avoids a circular
// import between welcome and today.
const INTEREST_LABEL: Record<string, string> = {
  food: "Food",
  outdoors: "Outdoors",
  arts: "Arts",
  family: "Family",
  sports: "Sports",
  shopping: "Shopping",
  wellness: "Wellness",
  lodging: "Lodging",
};

function summarize(slugs: string[]): string {
  const labels = slugs
    .map((s) => INTEREST_LABEL[s])
    .filter((l): l is string => Boolean(l));
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;
  return `${labels[0]} + ${labels.length - 1} more`;
}

export default function InterestsChip() {
  const slugs = useSyncExternalStore(
    subscribeNoop,
    () => getInterests(),
    () => [] as string[],
  );
  if (slugs.length === 0) return null;
  const summary = summarize(slugs);
  if (!summary) return null;

  return (
    <Link
      href="/radius"
      className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.96]"
      style={{
        background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
        color: "var(--app-cool)",
      }}
      aria-label={`Your interests: ${summary}`}
    >
      <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      Into: {summary}
    </Link>
  );
}
