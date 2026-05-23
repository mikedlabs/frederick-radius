"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";

/**
 * HomeMuniChip — a small "you're focused on X" affordance that appears
 * on Today only when the user picked a home municipality during the
 * /welcome flow.
 *
 * The chip is the visible payoff of Phase D's "Where in the county?"
 * step: opening the app on a return visit shows the personalization
 * landed, not just disappeared into localStorage. Tap-through goes to
 * the municipality's own page (`/m/<slug>`).
 *
 * SSR-safe via useSyncExternalStore: returns null on the server and
 * pre-hydration, then renders the chip on the client only if a value
 * is stored. No hydration mismatch, no flash of wrong content.
 *
 * No-op when:
 *   - localStorage unavailable
 *   - user skipped step 2 (no home muni)
 *   - stored slug doesn't resolve to a known municipality
 */

// Two subscribed reads, one for SSR snapshot (null) and one for the
// client snapshot (current localStorage value). The chip is set-once
// per session — no polling needed — so a no-op subscriber is fine.
const subscribeNoop = () => () => {};

export default function HomeMuniChip() {
  const slug = useSyncExternalStore(
    subscribeNoop,
    () => getHomeMuni(),
    () => null,
  );
  if (!slug) return null;
  const muni = MUNICIPALITY_BY_SLUG[slug];
  if (!muni) return null;

  return (
    <Link
      href={`/m/${muni.slug}`}
      className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.96]"
      style={{
        background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
        color: "var(--app-brand)",
      }}
      aria-label={`Personalized for ${muni.name}`}
    >
      <MapPin className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      Your spot: {muni.name}
    </Link>
  );
}
